import {
  normalizeFieldNameWithSpace,
  delay,
  isVisible,
  isCheckwritersrecruitHost
} from '../utils.js';



// kill live-status & helper text that leaks into container text on many hosts
const CONTAINER_NOISE_RE =
/\b(required|optional|characters?\s*remaining|drag\s*(?:and|&)\s*drop|click to upload|upload(?: a)? file|choose file|attach(?:ment)?|file size.*|max(?:imum)? size.*|no location found|try entering a different location|loading|analyzing resume|couldn'?t auto read resume|success|error|warning|info)\b.*$/i;
// ========= RESUME HELPERS (unchanged except for minor hygiene) =========
const FILE_POS_KW_RE = /\b(resume|cv|curriculum\s*vitae|cover\s*letter)\b/i;
const FILE_NEG_KW_RE = /\b(attach|upload|svgs|choose|select|browse|drag|drop|click|tap|select\s+one)\b/i;
const FILE_SIZE_HINT_RE = /\b(?:max(?:imum)?\s*size|size\s*limit)\b.*|\(\s*\d+(?:\.\d+)?\s*(kb|mb|gb)\s*max\)/i;
function isFileField(el) {
  if (!el) return false;
  // Native file input
  if ((el.type || '').toLowerCase() === 'file') return true;
  // Checkwriters dropzone widget
  if (isCheckwritersrecruitHost&& isDropzoneResumeWidget(el)) return true;
  return false;
}

function stripFileCtas(s){
  if(!s) return '';
  return s.replace(FILE_SIZE_HINT_RE,' ').replace(/\b(or)\b/ig,' ').replace(/\s+/g,' ').trim();
}
function findFileFieldName(field, maxHops = 6){
  if(!isFileField(field)) return '';
  const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,span,strong,[role="heading"],legend,[data-automation-id],label';//,[data-automation-id*="Heading"],[data-automation-id*="title"],label';
  if(field.id){
    const lab = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
    const t = stripFileCtas(lab?.textContent || '');
    if(FILE_POS_KW_RE.test(t)) return normalizeFieldNameWithSpace(t);
  }
  let el = field;
  for(let hop=0; el && el!==document.body && hop<=maxHops; hop++, el = el.parentElement){
    const h = el.querySelector(HEADING_SEL)
    if(h?.textContent){
      const t = stripFileCtas(h.textContent);
      if(FILE_POS_KW_RE.test(t)) return normalizeFieldNameWithSpace(t);
    }
    const selfTxt = stripFileCtas(el.textContent || '');
    if(FILE_POS_KW_RE.test(selfTxt) && selfTxt.split(/\s+/).length > 2)
      return normalizeFieldNameWithSpace(selfTxt);

    let prev = el.previousElementSibling;
    if(prev){
      const prevTxt = stripFileCtas(prev.textContent || '');
      if(FILE_POS_KW_RE.test(prevTxt)) return normalizeFieldNameWithSpace(prevTxt);
      const prevHead = prev.matches(HEADING_SEL) ? prev : prev.querySelector(HEADING_SEL);
      if(prevHead?.textContent){
        const t = stripFileCtas(prevHead.textContent);
        if(FILE_POS_KW_RE.test(t)) return normalizeFieldNameWithSpace(t);
      }
    }
    el = el.parentElement;
  }
  return '';
}
/*************************************************
 * Host gating
 *************************************************/
const SET1_HOSTS = new Set([
  'icims.com',              // <- add more later
]);

const SET2_HOSTS = new Set([
  'ashbyhq.com',
  'myworkdayjobs.com',
  'greenhouse.io',
  'boards.greenhouse.io',
]);

function hostIn(set) {
  const h = (location.hostname || '').toLowerCase();
  for (const d of set) {
    if (h === d || h.endsWith(`.${d}`)) return true;
  }
  return false;
}

const IS_SET1 = hostIn(SET1_HOSTS); // needs all the special checks (icims)
const IS_SET2 = hostIn(SET2_HOSTS); // no special checks (plain resume fields)

/*************************************************
 * Existing helpers (unchanged except where noted)
 *************************************************/

// ----- Messaging-based session helpers ----- sess means session
async function sessSet(obj) {
  const res = await chrome.runtime.sendMessage({ type: 'SESSION_SET', payload: obj });
  if (!res?.ok) throw new Error(res?.error || 'SESSION_SET failed');
  return true;
}
async function sessGet(keyOrNull) {
  const res = await chrome.runtime.sendMessage({ type: 'SESSION_GET', payload: keyOrNull ?? null });
  if (!res?.ok) throw new Error(res?.error || 'SESSION_GET failed');
  return res.data || {};
}
async function sessRemove(keyOrKeys) {
  const res = await chrome.runtime.sendMessage({ type: 'SESSION_REMOVE', payload: keyOrKeys });
  if (!res?.ok) throw new Error(res?.error || 'SESSION_REMOVE failed');
  return true;
}
async function sessClear() {
  const res = await chrome.runtime.sendMessage({ type: 'SESSION_CLEAR' });
  if (!res?.ok) throw new Error(res?.error || 'SESSION_CLEAR failed');
  return true;
}

// ----- Your pending flag helpers now just call sess* -----
const PENDING_KEY = 'ja_resume_pending_v1';
function pageKey() {
  try { return `${location.origin}${location.pathname}`; }
  catch { return location.href; }
}
async function setPendingResumeUpload(resumeSrc) {
  if (!IS_SET1) return;
  await sessSet({ [PENDING_KEY]: { page: pageKey(), t: Date.now(), resumeSrc } });
}
async function getPendingResumeUpload() {
  if (!IS_SET1) return null;
  const o = await sessGet(PENDING_KEY);
  return o?.[PENDING_KEY] || null;
}
async function clearPendingResumeUpload() {
  if (!IS_SET1) return;
  await sessRemove(PENDING_KEY);
}

const parsedFileInputs = new WeakSet();
function markAutofilled(el, source='resume') {
  try { el.setAttribute('data-autofilled', 'true'); } catch {}
  try { el.setAttribute('data-resume-parsed', 'true'); } catch {}
  try { el.dataset.afSource = source; } catch {}
  parsedFileInputs.add(el);
}
function setFilesWithNativeSetter(input, fileList) {
  try {
    // 1) Try the element's own descriptor (rare)
    const own = Object.getOwnPropertyDescriptor(input, 'files');
    if (own?.set) {
      own.set.call(input, fileList);
      return;
    }
    // 2) Try HTMLInputElement prototype
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    if (proto?.set) {
      proto.set.call(input, fileList);
      return;
    }
    // 3) As a last resort, define then assign (some sites lock it)
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: fileList });
  } catch (e) {
    console.warn('[resume] native setter failed, will attempt direct assign', e);
    try { input.files = fileList; } catch (e2) { console.error('[resume] direct assign failed', e2); }
  }
}

function dataURLtoBlob(dataurl){
  try{
    const [meta, data] = dataurl.split(',');
    const mime = ((meta || '').match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const bstr = atob((data || ''));
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }catch(e){
    console.error('[resume] dataURLtoBlob failed', e);
    return new Blob([], { type: 'application/octet-stream' });
  }
}

function fetchResumeFromBackground(fileUrl){
  return new Promise((resolve, reject)=>{
    try{
      chrome.runtime.sendMessage({ action:'fetchResume', fileUrl }, (resp)=>{
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError?.message || 'runtime error');
          return;
        }
        if (resp && resp.success && resp.fileData) resolve(resp);
        else reject(resp?.error || 'background fetch failed');
      });
    }catch(e){ reject(e); }
  });
}
// Some ATS require a user gesture before file assignment
async function withUserGesture(input, fn){
  try {
    input.focus();
    // A short, real click tends to satisfy most defenses
    //input.click?.();
    await new Promise(r => setTimeout(r, 30));
  } catch {}
  return await fn();
}
const RESUME_POS = [/\bresume\b/i, /\bcv\b/i, /\bcurriculum\s*vitae\b/i, /\brésumé\b/i];
const RESUME_NEG = [/\bcover\s*letter\b/i, /\btranscript\b/i, /\breferences?\b/i];
function isResumeHumanName(name=''){
  const t = String(name || '').trim();
  if (!t) return false;
  if (RESUME_NEG.some(r => r.test(t))) return false;
  return RESUME_POS.some(r => r.test(t));
}
async function tryCheckwritersUploadViaHiddenInput(zoneEl, fileUrl) {
  // 1) Click the zone to trigger creation of the hidden input (many Dropzones do this)
  try { zoneEl?.scrollIntoView?.({ block: "center" }); } catch {}
  //try { zoneEl?.click?.(); } catch {}

  // 2) Wait briefly for a hidden input to appear
  /*
  const findInputNear = () => (
    zoneEl.querySelector('input[type="file"]') ||
    zoneEl.closest('#files\\.Resume, [id="files.Resume"], form')?.querySelector('input[type="file"]')
  ); */
  const findInputNear = () => {
    // 1) Direct child
    const direct = zoneEl?.querySelector?.('input[type="file"]:not([disabled])');
    if (direct) return direct;

    // 2) SuccessFactors EU: look in attachment options/label containers
    if (isSuccessEuHost) {
      //try { zoneEl?.click?.(); } catch {}
      return (
        zoneEl?.closest?.('[id*=":_attachOptions"], [id*=":_attachLabel"], [class*="attachmentOptions"], [class*="attachmentLabel"]')
          ?.querySelector('input[type="file"]:not([disabled])')
        ||
        document.querySelector('input[type="file"][id*=":_file"]:not([disabled])') // global fallback
      );
    }

    // 3) Checkwriters fallback
    return zoneEl
      ?.closest('#files\\.Resume, [id="files.Resume"], form')
      ?.querySelector('input[type="file"]:not([disabled])');
  };

  let input = null;
  const t0 = performance.now();
  while (performance.now() - t0 < 2500) {
    input = findInputNear();
    if (input) break;
    await delay(80);
  }

  if (input) {
    // 3) Use your existing proven assignment strategy
    return await simulateFileSelectionFromBackground(input, fileUrl);
  }
  console.log('Input it is tratin for checkrecruiters resume',input);
  //4) No input ever surfaced -> try drag-drop onto the zone
  return await tryAttachToDropzones(fileUrl, zoneEl);
}
/*************************************************
 * Wait for ATS parsers to finish — used only on SET1
 *************************************************/
async function waitForResumeParseToFinish({
  timeoutMs = 15000,
  quietMs   = 1200,
  pollMs    = 200
} = {}) {
  if (!IS_SET1) return { navigated:false }; // <-- gate: skip for set2/others

  const startKey = pageKey();

  const spinnerSel = [
    '.spinner', '.loading', '[aria-busy="true"]',
    '.wd-loading', '.icims-loading', '.ashby-loading',
    '.sr-loading', '.gh-loading', '[data-test="loading"]'
  ].join(',');

  const snapshotInputs = () => {
    const arr = [];
    document.querySelectorAll('input, textarea, select').forEach(el => {
      if (!el || !(el instanceof HTMLElement)) return;
      const type = (el.type || '').toLowerCase();
      if (type === 'password' || type === 'hidden') return;
      arr.push({ el, val: ('value' in el ? el.value : ''), disabled: !!el.disabled });
    });
    return arr;
  };
  const hasValuesChanged = (b, a) => {
    if (a.length !== b.length) return true;
    for (let i=0; i<b.length; i++){
      const x=b[i], y=a[i];
      if (x.el !== y.el) return true;
      if (x.val !== y.val) return true;
      if (x.disabled !== y.disabled) return true;
    }
    return false;
  };

  const before = snapshotInputs();
  let lastDomChange = performance.now();
  const mo = new MutationObserver(() => { lastDomChange = performance.now(); });
  try { mo.observe(document.documentElement, { childList:true, subtree:true, attributes:true, characterData:true }); } catch {}

  const hasSpinner = () => !!document.querySelector(spinnerSel);
  const urlChanged = () => pageKey() !== startKey;

  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const after = snapshotInputs();
    const valueChurn = hasValuesChanged(before, after);

    if (urlChanged() || (valueChurn && !hasSpinner())) break;
    await delay(pollMs);
  }

  const quietStart = performance.now();
  while (performance.now() - quietStart < quietMs) {
    if (performance.now() - lastDomChange < quietMs/2) {
      await delay(pollMs);
      continue;
    }
    await delay(pollMs);
  }

  try { mo.disconnect(); } catch {}
  return { navigated: urlChanged() };
}
//Helper we are adding to avoid missing of file input in checkwritersrecruit.com because they are using non trigger html with js events for resume
function isDropzoneResumeWidget(el) {
  if (!el) return false;
  if (!(el.classList?.contains('dropzone') || el.classList?.contains('dz-clickable'))) return false;

  const scope = el.closest('form, .field, .file-widget, [id*="files."], [class*="file"]') || el;

  const txt = (scope.textContent || '').toLowerCase();
  console.log('The text:',txt);
  // hard negatives
  if (txt.includes('cover letter')) return false;
  if (txt.includes('transcript')) return false;

  // positives
  if (txt.includes('resume') || txt.includes('cv')) return true;


  // Or it lives under the known resume container ids/classes
  const wrap = el.closest('#files\\.Resume, [id="files.Resume"], .file-field-input, .file-widget');
  return !!wrap;

}
//Lever related function, where we are waiting unitl resume was parsed,to avoid autofill not parsing/erasing issue
function waitForCondition(fn, { timeout = 7000, interval = 80 } = {}) {
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      let ok = false;
      try { ok = !!fn(); } catch {}
      if (ok) return resolve(true);
      if (performance.now() - start >= timeout) return resolve(false);
      setTimeout(tick, interval);
    };
    tick();
  });
}

// Wait until Lever resume parsing is done (success OR done rendering)
async function waitForLeverResumeParsed({ timeout = 9000 } = {}) {
  // If there is no resume status area, do not block.
  const hasAnyStatus = () =>
    document.querySelector('.resume-upload-working, .resume-upload-success, .resume-upload-failure');

  if (!hasAnyStatus()) return false;

  // If success is already visible, proceed immediately.
  const successVisible = () => isVisible(document.querySelector('.resume-upload-success'));
  if (successVisible()) return true;

  // Wait until success visible OR failure visible OR working disappears.
  const ok = await waitForCondition(() => {
    const working = document.querySelector('.resume-upload-working');
    const failure = document.querySelector('.resume-upload-failure');
    const success = document.querySelector('.resume-upload-success');

    if (isVisible(success)) return true;
    if (isVisible(failure)) return true;

    // fallback: if "working" exists but is no longer visible, parsing likely finished
    if (working && !isVisible(working)) return true;

    return false;
  }, { timeout });

  return ok;
}
function dropContainerNoise(s){
  return (s || '')
    .replace(CONTAINER_NOISE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
async function simulateFileSelectionFromBackground(inputElement, fileUrl){
  console.log('1. entered into simulate function');
  const src = fileUrl.startsWith('http') ? fileUrl : `${API_BASE_URL}${fileUrl}`;
  const { fileData, filename } = await fetchResumeFromBackground(src);
  const blob = dataURLtoBlob(fileData);
  const file = new File([blob], filename || (src.split('/').pop() || 'resume.pdf'), { type: blob.type || 'application/pdf' });
  const dt = new DataTransfer();
  dt.items.add(file);
  console.log('2.. In simulatefileselection func before ensure visible')
  console.log('3.. In simulatefileselection func going to set the file')
  return withUserGesture(inputElement, async () => {
    inputElement.dispatchEvent(new Event('focus', { bubbles: true }));
    // Emit an innocuous input event pre-assignment to wake frameworks
    inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    setFilesWithNativeSetter(inputElement, dt.files);
    // Many frameworks listen to 'change' only
    inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    // Some also react to a second input after change
    inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    if(!isSuccessEuHost){
      inputElement.blur();
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    return true;
  });
}
async function tryAttachToDropzones(fileUrl,el= null){
  /*
  let zones;
  if(isCheckwritersrecruitHost){
    zones = el.closest('.dropzone, [data-dropzone], .file-drop, .upload-drop, [role="button"].drop, .upload-area, .dz-clickable, .dz-default, .attachment-drop, .file-uploader');
  }
  if(!zones){
    zones = document.querySelectorAll('.dropzone, [data-dropzone], .file-drop, .upload-drop, [role="button"].drop, .upload-area, .dz-clickable, .dz-default, .attachment-drop, .file-uploader');
  }
  if(!zones.length) return false; */
  let zones;
  if (isCheckwritersrecruitHost) {
    zones = el.closest('.dropzone, [data-dropzone], .file-drop, .upload-drop, [role="button"].drop, .upload-area, .dz-clickable, .dz-default, .attachment-drop, .file-uploader');
  }
  if (!zones) {
    zones = document.querySelectorAll('.dropzone, [data-dropzone], .file-drop, .upload-drop, [role="button"].drop, .upload-area, .dz-clickable, .dz-default, .attachment-drop, .file-uploader');
  }
  const zoneList = zones instanceof Element ? [zones] : Array.from(zones || []);
  if (zoneList.length === 0) return false;
  const src = fileUrl.startsWith('http') ? fileUrl : `${API_BASE_URL}${fileUrl}`;
  const { fileData, filename } = await fetchResumeFromBackground(src);
  const blob = dataURLtoBlob(fileData);
  const file = new File([blob], filename || (src.split('/').pop() || 'resume.pdf'), { type: blob.type || 'application/pdf' });

  for(const z of zoneList){
    try{
      z.classList.add('autofill-drop-indicator');
      const dt = new DataTransfer();
      dt.items.add(file);

      const enter = new DragEvent('dragenter',{bubbles:true,dataTransfer:dt});
      const over  = new DragEvent('dragover', {bubbles:true,dataTransfer:dt});
      const drop  = new DragEvent('drop',     {bubbles:true,dataTransfer:dt});
      z.dispatchEvent(enter); await delay(60);
      z.dispatchEvent(over);  await delay(60);
      z.dispatchEvent(drop);
      await delay(400);
      z.classList.remove('autofill-drop-indicator');
      return true;
    }catch(e){
      z.classList?.remove('autofill-drop-indicator');
    }
  }
  return false;
}

export {
  dropContainerNoise,
  waitForLeverResumeParsed,
  waitForCondition,
  CONTAINER_NOISE_RE,
  FILE_POS_KW_RE,
  FILE_NEG_KW_RE,
  FILE_SIZE_HINT_RE,
  SET1_HOSTS,
  SET2_HOSTS,
  IS_SET1,
  IS_SET2,
  PENDING_KEY,
  parsedFileInputs,
  RESUME_POS,
  RESUME_NEG,
  isFileField,
  stripFileCtas,
  findFileFieldName,
  hostIn,
  sessSet,
  sessGet,
  sessRemove,
  sessClear,
  pageKey,
  setPendingResumeUpload,
  getPendingResumeUpload,
  clearPendingResumeUpload,
  markAutofilled,
  setFilesWithNativeSetter,
  dataURLtoBlob,
  fetchResumeFromBackground,
  withUserGesture,
  isResumeHumanName,
  tryCheckwritersUploadViaHiddenInput,
  waitForResumeParseToFinish,
  isDropzoneResumeWidget,
  simulateFileSelectionFromBackground, tryAttachToDropzones
};