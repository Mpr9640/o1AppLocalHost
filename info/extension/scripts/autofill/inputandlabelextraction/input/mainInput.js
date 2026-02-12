import {
  normalizeFieldNameWithSpace,
  isEffectivelyVisible,

  // host flags (used directly in this file)
  isApplyWorkableHost,
  isFidelityHost,
  isSuccessEuHost,
  isSuccessHost,
  isCheckwritersrecruitHost,
  isSmartRecruitersCareersHost,

  isJobCaseHost,
  isMetaHost,
  isWorkableJobsHost,
  isApexApplyHost,
  isPowerHost,
  isIcimsHost,
  isNjoynHost,
  isClearCompanyHost,
} from '../../utils.js';

import {
  isCookieOrConsentControl,
  isInNonFormChrome,
  isJunkInput,
  isFileTriggerButton,
  isToolbarish,
  triggerExpandAllSections,
  filterConsecutiveDuplicates,
} from './helpers.js';

import { inputFieldSelection } from '../label/mainLabel.js';

import {
  findAssociatedLabel,
  njoynOptionTextAfterInput,
} from '../label/helpers.js';

import { metaChoiceOptionLabel } from '../../populate/select/metaSelectHelpers.js';
import { refineDateHumanNameAndGroup } from '../../populate/date/date.js';
import { isFileField } from '../../resume/helpers.js';

import { groupCache } from '../helpers.js';

// If you really do have this as an exported helper, import it.
// (Your doc list doesn’t mention it, so only keep this if it exists in utils.js)
import { isWorkdayHost } from '../../utils.js';

// Ashby helpers (ONLY if these functions are actually used in this file)
import {
  ashbyFindYesNoButtonsNear,
  ashbyQuestionTextFor,
} from '../label/ashbyHelpers.js';

// =============================
//  ROOT COLLECTION (DOC + SHADOW + IFRAMES)
// =============================

function allShadowHosts(root = document) {
  return [...root.querySelectorAll('*')].filter(el => el.shadowRoot);
}

function collectAllRoots() {
  const roots = [document];
  const stack = [...allShadowHosts(document)];

  // Include all same-origin iframes; visibility will be decided per-input.
  document.querySelectorAll('iframe').forEach(fr => {
    try {
      if (fr.contentDocument) {
        roots.push(fr.contentDocument);
        stack.push(...allShadowHosts(fr.contentDocument));
      }
    } catch (e) {
      // cross-origin, ignore
    }
  });

  while (stack.length) {
    const host = stack.pop();
    if (host.shadowRoot) {
      roots.push(host.shadowRoot);
      stack.push(...allShadowHosts(host.shadowRoot));
    }
  }
  return roots;
}
// =============================
//  MAIN INPUT COLLECTION
// =============================


// NOTE: groupCache should be defined somewhere globally if not already
//const groupCache = new WeakMap();
//NOTE: smartrecruiters  and smartrecruiterscareers hosts are different.
function collectInputsIn(root) {
  let sel = `
    input:not([disabled]):not([readonly]):not([type="hidden"]),
    textarea:not([disabled]):not([readonly]),
    [contenteditable="true"]:not([aria-disabled="true"]),
    [role="textbox"]:not([aria-disabled="true"]),
    [role="button"][aria-haspopup="listbox"]:not([aria-disabled="true"]),
    button[aria-haspopup="listbox"]:not([disabled])        
  `;
  //we are removing selector related to rolebox because it is selecting a div of country code(which comes under phone) and duplicate check is removing the main needed phone input.
  if(!isApplyWorkableHost){
      sel += `,[role="combobox"]:not([aria-disabled="true"])`;
  }
  // we are avoiding select for fidelity to avoid duplicate related to select inputs,struct: select,input  which is making removing input element in duplicate detection.
  if(!isFidelityHost){
    sel += `,select:not([disabled]):not([readonly])`;

  }
  
  // SuccssEu Host
  // 🟦 SUCCESSFACTORS.EU (resume upload triggers)
  if (isSuccessEuHost) {
    sel += `,
      /* SF custom radios (your screenshot) */
      [role="radio"]:not([aria-disabled="true"]),
      /* sometimes the click is on the wrapper span (your screenshot shows onclick on the outer span) */
      .globalRadio span[onclick]:not([aria-disabled="true"]),
      /* the clickable “Upload a Resume” label container */
      [role="button"][id*=":_attachDownloadLabel"]:not([aria-disabled="true"]),
      /* the inner A link “Upload a Resume” (javascript:void(0)) */
      a[id*=":attachDownloadLabelLink"][href^="javascript:void"],
      /* the plus/icon button that opens attachment dialog */
      [role="button"][id*=":_attachIcon"]:not([aria-disabled="true"])
    `;
  }

  // 🟦 SUCCESSFACTORS EXTENSIONS
  if (isSuccessHost) {
    sel += `,
      [role="button"]:not([aria-disabled="true"]),   /* captures custom clickable DIV/SPAN buttons */
      a[role="button"]:not([aria-disabled="true"]),  /* if they use <a role="button"> */
      a[href^="javascript:void"]                     /* captures the resume upload A tag */
    `;
  }
  //we are defining this because the checkwriters using js click events instead of html trigger events(but, a)
  if(isCheckwritersrecruitHost){
    sel += `,
      .filepicker.dropzone.dz-clickable,
      .dropzone.dz-clickable,
      [class*="dropzone"][class*="dz-clickable"],
      /* if they also render a hidden real input somewhere */
      input[type="file"]:not([disabled])
    `;
  }
  // we are defining this for smartrecruiterscareers domain to prevent un extraction of resume from page
  if (isSmartRecruitersCareersHost) {
  sel += `,
      a.formbuilder-file-upload,
      a.formbuilder-dropbox-file-upload,
      a[class*="formbuilder-"][class*="file-upload"],
      /* optional: if they add a real file input sometimes */
      input[type="file"]:not([disabled])
    `;
  }

  let nodes = [...root.querySelectorAll(sel)];
  //console.log('Total Inputs collected before filtering',nodes.slice(0,30));
  // we are removing the select tags from inputs because to avoid selecting country code related to phone and thinking phone input as duplicate.
  if (isCheckwritersrecruitHost) {
    nodes = nodes.filter(el => el.tagName !== "SELECT");
  }
  const results = [];
  let groupCounter = 0;
  // ✅ SmartRecruiters helpers (local to this function)
  const srResolveFileInput = (aEl) => {
    const linkId = aEl?.getAttribute?.("data-link-id");
    if (!linkId) return null;
    // Find the real hidden file input that matches this widget instance
    return root.querySelector(`input[type="file"][data-link-id="${CSS.escape(linkId)}"]`);
  };

  const srHumanName = (aEl, fileInput) => {
    // Prefer your existing label finder if it works
    const byInput = (typeof inputFieldSelection === "function") ? inputFieldSelection(fileInput) : "";
    if (byInput) return byInput;

    // Fallback: SmartRecruiters markup usually has a label in the same attrax-form-item block
    const wrap = aEl.closest(".attrax-form-item") || fileInput?.closest?.(".attrax-form-item");
    const lbl = wrap?.querySelector?.("label");
    return (lbl?.textContent || aEl.getAttribute("aria-label") || aEl.textContent || "upload file").trim();
  };
  for (const input of nodes){
    const tag = input.tagName;
    const type = (input.type || '').toLowerCase();
    const doc = input.ownerDocument || document;
     // ============================================================
    // ✅ STEP 3: SmartRecruiters proxy A-tag -> real hidden file input
    // ============================================================
    if (
      isSmartRecruitersCareersHost &&
      tag === "A" &&
      input.matches(
        ".formbuilder-file-upload, .formbuilder-dropbox-file-upload, a[class*='formbuilder-'][class*='file-upload']"
      )
    ) {
      const realFile = srResolveFileInput(input);

      // If we can’t resolve, skip (don’t create a broken field)
      if (!realFile) continue;

      // Build a normalized object as a FILE field
      const hn = srHumanName(input, realFile);
      results.push({
        element: realFile,                 // ✅ REAL upload target
        clickTarget: input,                // ✅ UI trigger (anchor)
        elementType: "file",
        groupId: null,
        humanName: normalizeFieldNameWithSpace(hn || "upload resume"),
        source: "smartrecruiterscareers",
        isSmartRecruitersCareersProxy: true
      });

      // Don’t let the A-tag fall through as a normal field
      continue;
    }

    // ✅ SmartRecruiters: skip metadata hidden cvfile input if it ever gets collected
    if (
      isSmartRecruitersCareersHost &&
      tag === "INPUT" &&
      type === "hidden" &&
      (input.dataset?.type || "") === "cvfile"
    ) {
      continue;
    }
    if (isToolbarish(input)) continue;
    // Visibility exception for workday file inputs and Meta domain,...
    if ((!isJobCaseHost) && (!isMetaHost) && (!isWorkableJobsHost) && (!(isApplyWorkableHost && type === 'checkbox')) && !(isWorkdayHost() && input.type === 'file')) {
      if (!(isApexApplyHost && isFileField(input))) {
        if (!isEffectivelyVisible(input)) continue;
      }
    }
    if (isCookieOrConsentControl(input)) continue;
    if (isInNonFormChrome(input)) continue;
    if (isJunkInput(input)) continue;
    // ----- TAG / TYPE filtering -----
    // We need to know ahead of time if this is a select-like trigger / file trigger
    let isSelectTriggerButton = false;  // ✅ CHANGE
    let isFileTrigger = false;          // ✅ CHANGE
    if (tag === 'BUTTON') {
      const role = input.getAttribute('role');
      const hasPopup = (input.getAttribute('aria-haspopup') || '').toLowerCase();
      // Treat Workday-style country dropdowns as select-like:
      //  <button aria-haspopup="listbox" ...>Selected text</button>
      const looksLikeSelect =
        role === 'combobox' ||
        hasPopup === 'listbox' ||
        hasPopup === 'dialog' ||
        // Workday often uses data-automation-id for select controls
        (input.getAttribute('data-automation-id') || '').toLowerCase().includes('select');
      if (isFileTriggerButton(input)) {
        // upload / select files button
        isFileTrigger = true;
      } else if (looksLikeSelect) {
        // keep this as a select-like trigger
        isSelectTriggerButton = true;
      } else {
        // all other buttons are not data fields
        continue;
      }
    }

    if (tag === 'INPUT') {
      if (['button', 'submit', 'reset', 'image'].includes(type)) {
        // Submit/etc aren’t data fields; upload handled above
        continue;
      }
    }

    const style = input.ownerDocument.defaultView.getComputedStyle(input);
    const inFloatingPanel =
      !!input.closest('[role="listbox"], [role="dialog"], [role="menu"]') &&
      (style.position === 'fixed' || style.position === 'absolute');

    if (inFloatingPanel && tag === 'INPUT' && type === 'text' && !isFileTrigger) {
      // skip overlay search boxes, but don't skip file trigger buttons
      continue;
    }

    // ---- iCIMS specific handling ----
    if (typeof isIcimsHost !== 'undefined' && isIcimsHost) {
      if (input.closest('[role="listbox"], [role="dialog"], [role="menu"]')) {
        if (
          tag === 'INPUT' &&
          (type === 'text' || input.classList.contains('dropdown-search'))
        ) {
          continue;
        }
      }

      if (
        input.matches(
          '#nav-trigger, ' +
          'textarea[id^="h-captcha-response"], ' +
          'textarea.g-recaptcha-response'
        )
      ) {
        continue;
      }
    }
    // GROUPING / HUMAN NAME LOGIC
    let groupId = null;
    let humanName = null;
    // Container-based fallback if we STILL don't have a key
    let container =input.closest('fieldset, section, div, form, ul, ol, table, tbody, tr') || root;
    if (type === 'checkbox' || type === 'radio') {
      // This becomes `humanName` for choice inputs.
      let optionLabel = '';

      // 1) normal associated <label for="...">
      if (typeof findAssociatedLabel === 'function') {
        optionLabel = findAssociatedLabel(input) || '';
      }

      // 2) fallback: aria-label / aria-labelledby for the option itself
      if (!optionLabel && input.hasAttribute('aria-label')) {
        optionLabel = input.getAttribute('aria-label') || '';
      }

      if (!optionLabel && input.hasAttribute('aria-labelledby')) {
        const ids = input.getAttribute('aria-labelledby').split(/\s+/).filter(Boolean);
        const txt = ids
          .map(id => doc.getElementById(id)?.textContent || '')
          .join(' ')
          .trim();
        if (txt) optionLabel = txt;
      }
      // 🔹 NJOYN SPECIAL CASE:
      // radios are like:
      //   <input value="1"> Yes, I have a disability...
      //   <input value="2"> No, I do not...
      //   <input value="3"> I do not want to answer
      if (isNjoynHost) {
        const after = njoynOptionTextAfterInput(input);
        if (after) {
          optionLabel = after; // prefer visible text over "1/2/3"
        }
      }
        // 🔹 CLEARCOMPANY: option label is inside <label> ... <span>Yes/No</span>
      if (isClearCompanyHost) {
        const optLabelEl = input.closest('label');
        if (optLabelEl) {
          const span = optLabelEl.querySelector('span');
          const txt = (span?.textContent || optLabelEl.textContent || '').trim();
          if (txt) {
            optionLabel = txt; // "Yes" / "No"
          }
        }
      }
      // ✅ META CAREERS SPECIAL CASE (fix "false")
      if (!optionLabel && isMetaHost) {
        const metaOpt = metaChoiceOptionLabel(input);
        if (metaOpt) optionLabel = metaOpt;
      }
      // 3) fallback: use raw value
      if (!optionLabel && input.value) {
        optionLabel = input.value;
      }

      humanName = normalizeFieldNameWithSpace(optionLabel || '');
            // ---------- QUESTION TEXT (shared groupId) ----------
      let questionText = '';

      // A. host-specific: Ashby – we already have a helper
      //if (isAshbyHost && typeof ashbyQuestionTextFor === 'function') {
        //questionText = ashbyQuestionTextFor(input) || '';
      //}

      // B. host-specific: Meta careers (multi-location etc)
      if (!questionText && isMetaHost) {
        // listitem -> list -> blockRoot
        const listItem = input.closest('[role="listitem"]');
        const list = listItem ? listItem.parentElement : input.closest('[role="list"]');
        const blockRoot = list?.parentElement || list || container;

        if (blockRoot) {
          container = blockRoot;
          let labelText = '';
          let scanNode = blockRoot;
          let hops = 0;

          while (scanNode && hops < 3 && !labelText) {
            let prev = scanNode.previousElementSibling;
            while (prev && !labelText) {
              const t = (prev.textContent || '').trim();
              if (t) {
                labelText = t;
                break;
              }
              prev = prev.previousElementSibling;
            }
            scanNode = scanNode.parentElement;
            hops++;
          }

          if (labelText) {
            questionText = labelText;
          }
        }
      }
      // 🔹 C. host-specific: njoyn (clients.njoyn.com etc.)
      if (!questionText && (isNjoynHost || isSuccessHost)) {
        // Radios live inside a <td> that also contains an <h3> question
        let cell = input.closest('td,th');
        if (!cell && container) {
          cell = container.closest?.('td,th') || null;
        }
        if (cell && isSuccessHost) {
          let label = null;
          // If we’re in a table row, the question is usually in the TH before this TD
          const headerCell = cell.previousElementSibling;
          if (headerCell && headerCell.matches('th')) {
            label = headerCell.querySelector('label') || headerCell;
          }

          // Fallbacks: label[for="id"] or old behavior
          if (!label && input.id) {
            label = input.ownerDocument.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          }
          if (!label) {
            label = cell.closest('div');
          }

          if (label && label.textContent) {
            questionText = label.textContent.trim();   // → "Gender"
          }
        }
        if (cell) {
          // prefer heading inside this cell
          let heading =
            cell.querySelector('h1,h2,h3,h4,h5,h6');

          // if none, try earlier sibling cells in the same row
          if (!heading) {
            let prevCell = cell.previousElementSibling;
            while (prevCell && !heading) {
              heading = prevCell.querySelector('h1,h2,h3,h4,h5,h6');
              if (heading) break;
              prevCell = prevCell.previousElementSibling;
            }
          }
          if (heading && heading.textContent.trim()) {
            questionText = heading.textContent.trim();
          }
        }
      }
      // 🔹 CLEARCOMPANY: question text in <label class="radio-label ...">
      if (!questionText && isClearCompanyHost) {
        // climb to the form-group that wraps the question + radios
        let group = input.closest('.form-group.radio-group') ||
                    container.closest?.('.form-group.radio-group');

        if (group) {
          const qLabel =
            group.querySelector('label.radio-label') ||
            group.querySelector('label');

          if (qLabel && qLabel.textContent.trim()) {
            questionText = qLabel.textContent.trim();
          }
        }
      }
      // 🔹 POWERHRG: question is usually in a label above the radio button group
      if (!questionText && isPowerHost) {
        const group =
          input.closest('.form-group, .radio-group, .pjl-field, .pjl-row') || container;

        // Prefer a label that is NOT the option button label and NOT an error label
        const qLabel = group.querySelector('label:not(.btn):not(.error)');
        const txt = (qLabel?.textContent || '').trim();
        if (txt) questionText = txt;
      }


      if (!questionText){
         questionText = inputFieldSelection(input) || input.name || '';

      }
      const normQuestion = questionText
        ? normalizeFieldNameWithSpace(questionText)
        : '';

      if (normQuestion) {
        groupId = normQuestion;
        if (!container._humanName) {
          // store question text on container for debugging / other logic
          container._humanName = normQuestion;
        }
      } else {
        // If we truly couldn't find a readable question, fall back
        // to a stable but opaque key (keeps groups working).
        let key = '';
        if (input.name) key = `name:${input.name}`;
        if (!key && input.getAttribute('aria-labelledby')) {
          key = `aria:${input.getAttribute('aria-labelledby')}`;
        }
        if (!key) {
          if (!groupCache.has(container)) {
            groupCache.set(container, `group-${groupCounter++}`);
          }
          key = groupCache.get(container);
        }
        groupId = key;
      }

      // ---------- Ashby Yes/No buttons (unchanged) ----------
      if (typeof isAshbyHost !== 'undefined' && isAshbyHost && type === 'checkbox') {
        const yesNoBtns = ashbyFindYesNoButtonsNear(input);
        if (yesNoBtns && yesNoBtns.length) {
          const q = ashbyQuestionTextFor(input);
          const qNorm = q ? normalizeFieldNameWithSpace(q) : groupId;

          for (const b of yesNoBtns) {
            results.push({
              element: b.el,
              elementType: type,
              groupId: qNorm,
              humanName: normalizeFieldNameWithSpace(b.text),
              ashbyLinked: true,
              optionText: b.text,
            });
          }
        }
      }
    } else {
      // === non-choice fields (text, select, date, etc.) ===
      humanName =
        inputFieldSelection(input) ||
        input.name ||
        input.getAttribute?.('aria-label') ||
        '';
    }

    const obj = {
      element: input,
      elementType: type,
      groupId,
      humanName,
    };

    // Tag special button types for filler
    if (isFileTrigger) {
      obj.isFileTriggerButton = true;
    }
    if (isSelectTriggerButton || input.matches('[aria-haspopup="listbox"]')) {
      obj.isSelectLikeTrigger = true;
    }

    if (
      typeof isWorkdayHost === 'function' &&
      isWorkdayHost() &&
      typeof refineDateHumanNameAndGroup === 'function'
    ) {
      refineDateHumanNameAndGroup(obj);
    }

    results.push(obj);
  }

  // Keep group ordering stable: inputs first, then any buttons we added
  results.sort((a, b) => {
    if (a.groupId && a.groupId === b.groupId) {
      const aIsBtn = a.element?.tagName === 'BUTTON';
      const bIsBtn = b.element?.tagName === 'BUTTON';
      if (aIsBtn !== bIsBtn) return aIsBtn ? 1 : -1;
    }
    return 0;
  });
  if(results.length >=1 ){
    console.log('the results are:',results);
  }
  return results;
}
// Main entry: returns all visible, real form fields on the active page
function inputSelection() {
  // If you use section helpers / repeated-section indexing,
  // clear them here each pass.
  // resetSectionHelpers && resetSectionHelpers();

  const roots = collectAllRoots();
  const all = roots.flatMap(r => collectInputsIn(r));

  // Deduplicate by element identity
  const uniq = [];
  const seen = new WeakSet();
  for (const it of all) {
    //we are skipping powerhost domain because it is skipping some input fields ex; lastname.
    if (!isPowerHost && !seen.has(it.element)) {
      seen.add(it.element);
      uniq.push(it);
    }
    else{
      //seen.add(it.element);
      uniq.push(it);
    }
  }

  // Remove only *consecutive* duplicates with same humanName + no groupId
  const finalFields = filterConsecutiveDuplicates(uniq);

  // console.log('InputSelection: total visible fields', finalFields.length, finalFields.slice(0, 50));
  return finalFields;
}

export{allShadowHosts,collectAllRoots,collectInputsIn,inputSelection};