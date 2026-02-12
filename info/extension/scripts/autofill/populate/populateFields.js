import {
  isDropzoneResumeWidget
} from '../resume/helpers.js';
import {
  delay,
  norm,
  normalizeToBooleanLike,
  isIcimsHost,
  isGreenhouseHost,
  isSuccessEuHost,
  isLeverHost,
  isCheckwritersrecruitHost
} from '../utils.js';

import { fillInput } from './fillInput.js';

import { checkElement, US_ALIASES, fixGreenhouseCityState } from './helpers.js';

import { isDependencyTrigger, microDeltaAutofill } from './greenHouseDynamicInput.js';

import { isAshbyButtonEntry } from '../inputandlabelextraction/label/ashbyHelpers.js';

async function newPopulateFields(finalGrouped,autofillData) {
  if (!Array.isArray(finalGrouped) || !finalGrouped.length) return;
  const WD = isWorkdayHost?.() || false;
  const processedGroups = new Set();
  const processedDateBatches = new Set();
  const toBoolLike = (v) =>
    normalizeToBooleanLike?.(v) ??
    (v === true ? 'yes' : v === false ? 'no' : String(v ?? '').trim().toLowerCase());

  const isButtonEl = (el) => {
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'BUTTON' || tag === 'A' || el.getAttribute?.('role') === 'button';
  };

  const setAutofilled = (el) => {
    try {
      el.classList?.add('autofill-highlight');
      el.setAttribute?.('data-autofilled', 'true');
      setTimeout(() => el.classList?.remove('autofill-highlight'), 260);
    } catch {}
  };

  // detect date fields (keeps your old behavior + mapping.type === 'date' + _dateMeta)
  const isDateField = (obj, el) => {
    let t = ((el?.type || obj?.elementType || '') + '').toLowerCase();
    if( isCheckwritersrecruitHost && isDropzoneResumeWidget(el) ){t = 'file'};  //Adding this one for checkwritersrecruit host 
    if (obj?._dateMeta) return true;
    if (obj?.mapping?.type === 'date') return true;
    const hn = (obj?.humanName || '').toLowerCase();
    if (/\b(date|month|year)\b/.test(hn)) return true;
    return false;
  };

  for (let i = 0; i < finalGrouped.length; i++) {
    await delay(1500);
    const item = finalGrouped[i];
    console.log('In new populate the input going to fill',item);
    if (!item) continue;

    // =========================================================
    // KIND: nonGroup  (value lives on item.field.value)
    // =========================================================
    if (item.kind === 'nonGroup') {
      const obj = item.field;
      const el = obj?.element;
      if (!el) continue;
      //console.log('In new populate checking0');
      if (el.getAttribute?.('data-autofilled') === 'true') continue;
      if (el.disabled || el.readOnly) continue;
      //console.log('In new populate checking1');
      const inputName = obj?.humanName || '';

      // Workday: skip country
      if ((WD || isIcimsHost)&& /\bcountry\b/i.test(inputName)) continue;
      if(isIcimsHost && /\bstate\b/i.test(inputName)) continue;
  
      // Greenhouse specific code for country field.setting the value to 'united states' to avoid dom mess
      let val = obj?.value; // ✅ change #1: value is inside field
      if ((isGreenhouseHost || isIcimsHost || isSuccessEuHost) && /\bcountry\b/i.test(inputName) && US_ALIASES.has(norm(val)) ){
        console.log('Entered into Greenhouse with country')
        val = norm('United States');
        console.log('The value going to use is',val);
      }
      //greenhouse setting location format
      //const q = String(item?.question || '').toLowerCase();
      if (
        isGreenhouseHost &&
        (
          norm(inputName) === norm('location city') ||
          /\blocation\s*\(city\)\b/i.test(inputName) ||
          /\blocation\s+city\b/i.test(inputName)
        )
      ) {
        const before = String(val ?? '');
        const fixed = fixGreenhouseCityState(before, autofillData);

        if (fixed !== before) {
          console.log('Greenhouse location city corrected:', { before, after: fixed });
        }
        val = fixed;
      }
      //FOr lever we are keeping the location parsed by resume.
      if(isLeverHost && (norm(inputName) === norm('current location') ||
          /\blocation\b/i.test(inputName) ||
          /\bcurrent\s+location\b/i.test(inputName)
        )
      ){
        continue;
      }
      //we are adding this for checkrecruiterhost to avoid messing up with phone input because both country code and phone are in same field.
      if (
        isCheckwritersrecruitHost&&
        norm(inputName).includes('phone') &&
        typeof val === 'string'
      ) {
        const digits = val.replace(/[^\d]/g, '');

        if (digits.length === 10) {
          val = `+1${digits}`;
        }
      }

      if (val === undefined || val === null || val === '') continue;

      // keep your old boolean -> yes/no behavior
      if (val === true) val = 'yes';
      if (val === false) val = 'no';

      let t = ((el.type || obj?.elementType || '') + '').toLowerCase();
      if( isCheckwritersrecruitHost && isDropzoneResumeWidget(el) ){t = 'file'};  //Adding this one for checkwritersrecruit host 
      //console.log('In new populate checking2');
      // single checkbox special handling (non-group checkbox)
      if (t === 'checkbox') {
        const normVal = toBoolLike(val);

        // direct yes/no -> checked/unchecked
        if (normVal === 'yes' || normVal === 'no') {
          await checkElement(el, normVal === 'yes');
          setAutofilled(el);
          await delay?.(60);
          continue;
        }

        // fallback: if checkbox label is yes/no, align it
        const labelNorm = toBoolLike(findAssociatedLabel?.(el) || el.value || '');
        if (labelNorm === 'yes' || labelNorm === 'no') {
          await checkElement(el, normVal === labelNorm);
          setAutofilled(el);
          await delay?.(60);
          continue;
        }

        // generic truthy -> check
        await checkElement(el, !!val);
        setAutofilled(el);
        await delay?.(60);
        continue;
      }

      // never fill button elements as normal inputs
      //NOTE: For workday domain related to degree, it is not parsing the value due to button
      //if ((el.tagName || '').toUpperCase() === 'BUTTON') continue;
      /*
      // date handling (including split-date batching if you still have _dateMeta/groupId)
      if (isDateField(obj, el)) {
        console.log("In new populate fields, entered in to the Date input")
        if (obj?._dateMeta?.mode === 'split' && obj?.groupId) {
          const bkey = obj.groupId ||
            batchKeyForDate?.({ kind: obj.sectionKind, index: obj.sectionIndex }, obj);
          if (!processedDateBatches.has(bkey)) {
            console.log('In new autofillinit, entered in to process date batch with bkey',bkey);
            const peers = collectLocalSplitDatePeers?.(finalGrouped, i, obj) || [];
            if (!peers.length) {
              console.log('In new autofillinit,filldata starting with value:',val);
              await fillDate(el, obj, val, { currentlyWorkHere: !!obj?.mapping?.currently_work_here });
              setAutofilled(el);
            } else {
              for (const peer of peers) {
                console.log('In New autofill date',peer);
                await fillDate(peer.element, peer, val, {
                  currentlyWorkHere: !!peer?.mapping?.currently_work_here,
                });
                setAutofilled(peer.element);
              }
            }
            processedDateBatches.add(bkey);
          }

          await delay?.(60);
          continue;
        }

        await fillDate(el, obj, val, { currentlyWorkHere: !!obj?.mapping?.currently_work_here });
        setAutofilled(el);
        await delay?.(60);
        continue;
      } */
      // normal inputs
      if (t !== 'file') {
        await fillInput(el, val, { mapped: true ,humanName: inputName});
        setAutofilled(el);
      }
      await delay?.(60);
      if ( isGreenhouseHost && isDependencyTrigger(item, el)) {
        console.log('I entered into the dynamic chekcing');
        await microDeltaAutofill({
          preKeys,
          autofillData,
          //user_id
        });
      }
      continue;
    }

    // =========================================================
    // KIND: group (radio/checkbox OR ashby button options)
    // value is item.value = array of selected option objects
    // =========================================================
    if (item.kind === 'group') {
      const options = Array.isArray(item.options) ? item.options : [];
      if (!options.length) continue;

      const groupKey =
        item.groupId ||
        item.question ||
        (options[0]?.element && (options[0].element.name || options[0].element.id)) ||
        `group_${i}`;

      if (processedGroups.has(groupKey)) continue;

      const selectedArr = Array.isArray(item.value) ? item.value : [];
      const selectedEls = new Set(
        selectedArr.map((x) => x?.element).filter(Boolean)
      );

      const groupType = (item.elementType || options[0]?.elementType || '').toLowerCase();
      const isRadio = groupType === 'radio';
      const isCheckbox = groupType === 'checkbox';

      for (const opt of options) {
        const optEl = opt?.element;
        if (!optEl) continue;

        if (optEl.getAttribute?.('data-autofilled') === 'true') continue;
        if (optEl.disabled || optEl.readOnly) continue;

        const shouldSelect = selectedEls.has(optEl);

        // ✅ change #2: Ashby button entry support (plus generic button-like safety)
        const ashbyBtn = isAshbyButtonEntry(opt) || isButtonEl(optEl);
        if (ashbyBtn) {
          if (shouldSelect) optEl.click();
          setAutofilled(optEl);
          continue;
        }

        // normal checkbox/radio inputs
        if (isRadio) {
          await checkElement(optEl, shouldSelect);
        } else if (isCheckbox) {
          await checkElement(optEl, shouldSelect);
        } else {
          // fallback: treat as checkbox group
          await checkElement(optEl, shouldSelect);
        }

        setAutofilled(optEl);
      }
      processedGroups.add(groupKey);
      await delay?.(60);
      if ( isGreenhouseHost && isDependencyTrigger(item, el)) {
        console.log('I entered into the dynamic chekcing');
        await microDeltaAutofill({
          preKeys,
          autofillData,
          //user_id
        });
      }
      continue;
    }
  }
}


export{newPopulateFields};