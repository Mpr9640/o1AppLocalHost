import {
  IS_SET1,
  dataURLtoBlob,
  fetchResumeFromBackground,
  withUserGesture,
  setFilesWithNativeSetter,
  isResumeHumanName,
  markAutofilled,
  waitForResumeParseToFinish,
  setPendingResumeUpload,
  getPendingResumeUpload,
  clearPendingResumeUpload,
  pageKey,
  isDropzoneResumeWidget,
  tryCheckwritersUploadViaHiddenInput,
  simulateFileSelectionFromBackground, tryAttachToDropzones
} from './helpers.js';
import { delay, isSuccessEuHost, isCheckwritersrecruitHost } from '../utils.js';

// wherever you define it (example path)
//import { API_BASE_URL } from '../../config.js';

async function handleFileInput(input, fileUrl){
  const el = input;
  //let t = (el.type || '').toLowerCase()
  //if(isCheckwritersrecruitHost && isDropzoneResumeWidget(el)){t = 'file'};
  //if (t !== 'file' || input.disabled || input.readOnly) return false;
  console.log('1.handlefileinput func entered')
  // If a file already present, skip
  if (input.files && input.files.length > 0) {
    console.log('2. handlefileinput func file already present on this input — skipping upload');
    markAutofilled(input, 'resume');
    return true;
  }
  // ✅ Checkwriters: el is usually the dropzone DIV
  if ((isCheckwritersrecruitHost && el && isDropzoneResumeWidget(el)) ||(isSuccessEuHost)) {
    return await tryCheckwritersUploadViaHiddenInput(el, fileUrl);
  }
  // --- SET1 (icims): full pending + wait + re-entry support ---
  if (IS_SET1) {
    try { await setPendingResumeUpload(fileUrl); } catch {}
    try {
      const ok = await simulateFileSelectionFromBackground(input, fileUrl);
      if (ok) {
        const res = await waitForResumeParseToFinish();
        markAutofilled(input, 'resume');
        // Log pending state safely (no storage.session direct from CS)
        try {
          const pending = await getPendingResumeUpload();
          console.log('[resume] pending (after native set):', pending);
          if (pending && !res?.navigated && pending.page === pageKey()) {
            await clearPendingResumeUpload();
          }
        } catch {}
        return true;
      }
    } catch (e) {
      console.log('[resume] native set failed, trying dropzone', e);
    }

    try {
      const ok2 = await tryAttachToDropzones(fileUrl);
      if (ok2) {
        const res = await waitForResumeParseToFinish();
        markAutofilled(input, 'resume');
        try {
          const pending = await getPendingResumeUpload();
          console.log('[resume] pending (after drop):', pending);
          if (pending && !res?.navigated && pending.page === pageKey()) {
            await clearPendingResumeUpload();
          }
        } catch {}
        return true;
      }
    } catch (e) {
      console.log('[resume] dropzone failed', e);
    }
    return false;
  }

  // --- SET2 (ashby/workday/greenhouse) & others: simple upload, no waits/flags ---
  try {
    const ok = await simulateFileSelectionFromBackground(input, fileUrl);
    if (ok) { markAutofilled(input, 'resume'); return true; }
  } catch (e) {
    console.log('[resume] simple upload failed, trying dropzone (set2/others)', e);
  try {
    const ok2 = await tryAttachToDropzones(fileUrl);
    if (ok2) { markAutofilled(input, 'resume'); return true; }
  } catch { console.log('[resume] trying dropzone  failed', e);}
  }
  return false;
}
async function newResumeFirstFromFinalGrouped(finalGrouped, autofillData = null, watchMs = 1000) {
  if (!Array.isArray(finalGrouped) || !finalGrouped.length) {
    return { ok: false, reason: 'no-inputs' };
  }

  console.log('1 resumefirst func parsing started');

  // 1) Collect candidate resume file <input type="file"> fields from finalGrouped
  const candidates = finalGrouped
    .filter(it => it && it.kind === 'nonGroup' && it.field && it.field.element)
    .map(it => it.field)
    .filter(f => {
      const el = f?.element;
      if (!el) return false;
      let t = (el.type || '').toLowerCase();
      if(isCheckwritersrecruitHost && isDropzoneResumeWidget(el)){t = 'file'};
      if(isSuccessEuHost && isResumeHumanName?.(f.humanName)); {t='file'};
      console.log('In resumefirst the file type is:',t);
      if (t !== 'file') return false;
      if (!f.humanName) return false;
      return isResumeHumanName?.(f.humanName);
    });

  if (candidates.length === 0) return { ok: false, reason: 'no-resume-file-input' };
  console.log('IN newresumefirst the inputs found as resume:',candidates);
  // 2) Prefer resume source from field.value (new pipeline), fallback to autofillData["resume"]
  let resumeFile =
    candidates.find(f => f.value !== undefined && f.value !== null && f.value !== '')?.value //??
    //autofillData?.['resume'];

  if (!resumeFile) {
    console.log('[resume] no resume file/url found on candidates[].value or autofillData["resume"]');
    return { ok: false, reason: 'no-resume-data' };
  }

  let anySuccess = false;

  for (const r of candidates) {
    const el = r.element;
    const label = String(r.humanName || '');

    // Skip ATS-wide "autofill" slots
    if (label.toLowerCase().includes('autofill')) {
      console.log('2.resumefirst func skipping autofill-slot:', label);
      continue;
    }

    // input already has a file (e.g., after refresh)
    if (el.files && el.files.length > 0) {
      console.log('3.resume first func input already has file, skipping:', label);
      markAutofilled?.(el, 'resume');
      anySuccess = true;
      continue;
    }

    console.log('4.resume first func uploading into:', label);
    try {
      const ok = await handleFileInput(el, resumeFile);
      if (ok) {
        anySuccess = true;
        markAutofilled?.(el, 'resume');

        // keep your special wait behavior (Set1 hosts)
        if (typeof IS_SET1 !== 'undefined' && IS_SET1) {
          await new Promise(res => setTimeout(res, Math.max(500, watchMs)));
        }
      }
    } catch (e) {
      console.log('[resume] file handle error', e);
    }
  }

  return anySuccess ? { ok: true } : { ok: false, reason: 'resume-upload-failed' };
}

export {
  handleFileInput,
  newResumeFirstFromFinalGrouped,
};
