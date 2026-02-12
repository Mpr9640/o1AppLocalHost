import {
  isWorkdayMultiSelect,
  isWorkdayCombo,
  fillWorkdayByButton,
  fillWorkdayMultiSelectByButton
} from './select/workdaySelectHelpers.js';

import {
  isComplexDropdown
} from './select/helpers.js';

import {
  fillSelectElement
} from './select/mainSelect.js';

import {
  isDropzoneResumeWidget
} from '../resume/helpers.js';
import {
  delay,
  isGreenhouseHost,
  isMetaHost,
  isCheckwritersrecruitHost
} from '../utils.js';

import {
  simulateMouse,
  setValueWithNativeSetter,
  fireInputEvents,
  clickLikeUser
} from './helpers.js';

import { markAutofilled } from '../resume/helpers.js';

import { isWorkdaySplitDatePart, datePartBias } from './date/date.js';

/*
type FillOpts = {
  humanName?: string
  mapped?: boolean
  timeout?: number
  exactFirst?: boolean
  semanticMin?: number
}; */


//step-11, To fill input fields
// --- updated: just adds mouse + a couple key events; rest unchanged ---
async function fillInput(el, value, opts = {}){
  const {
    humanName = "",
    mapped = false
  } = opts;
  if(!el || el.disabled || el.readOnly) return;
  const tag = el.tagName?.toUpperCase?.() || '';
  let  type = (el.type||'text').toLowerCase();
  if( isCheckwritersrecruitHost && isDropzoneResumeWidget(el) ){type = 'file'};  //Adding this one for checkwritersrecruit host 
  let normVal = value;
  if (normVal === true || normVal === 'true') normVal = 'yes';
  if (normVal === false || normVal === 'false') normVal = 'no';


  el.scrollIntoView({behavior:'smooth', block:'center'});
  await delay(40);

  if(type==='file'){ console.log('skipping becuase of file');return; }
  //we are defining this because to avoid dom mess with country and phone inputs
  if(isGreenhouseHost && el.type === 'tel'){
    console.log('Entered into telphone:')
    // STANDARD INPUT
    console.log('filling standard inputs');
    simulateMouse(el);              // NEW
    el.focus();
    el.click();
    setValueWithNativeSetter(el, String(normVal)); //setting value
    fireInputEvents(el, normVal);
    el.blur(); 
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    await delay(50);
    markAutofilled(el, 'choice');
    return;

  }

  // WORKDAY MULTISELECT INPUT (Field of Study, Skills, etc.)
  if (isWorkdayMultiSelect(el)) {
    console.log('Fillinput func, Entered into workday  multiselect');
    const ok = await fillWorkdayMultiSelectByButton(el, normVal, opts);
    if (ok) el.setAttribute('data-autofilled', 'true');
    return;
  }
  // Workday single input field with arrow icon.
  if (isWorkdayCombo(el) && !isMetaHost) {
    console.log('Fill Input workdaycombo for select');
    //const ok = await fillWorkdayDropdown(el, value);
    const ok = await fillWorkdayByButton(el, normVal,opts);
    if (ok) el.setAttribute('data-autofilled','true');
    return;
  }

  if (tag === 'SELECT' || isComplexDropdown(el)) {
    console.log('1. fill Input select complex type');
    const ok = await fillSelectElement(el,normVal,{humanName});
    if (ok) el.setAttribute('data-autofilled', 'true');
    return;
  }
  // CONTENTEDITABLE
  if(el.isContentEditable || el.getAttribute('role')==='textbox'){
    console.log('filling content editable and text')
    simulateMouse(el);//not contains click event         // NEW
    el.focus();
    el.click();
    try{
      document.execCommand('selectAll',false,null);
      document.execCommand('insertText', false, String(normVal));
    }catch{
      el.textContent = String(normVal);
    }
    fireInputEvents(el, normVal); //contains change event
    el.dispatchEvent(new Event('change', { bubbles: true })); 
    el.blur(); 
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    await delay(50);
    markAutofilled(el, opts.mapped ? 'mapped' : 'fallback');
    if (opts.mapped) await waitForUiUpdates?.(2000);
    return;
  }
  // WORKDAY SPLIT DATE (MM / YYYY) – avoid el.click(), use coordinate pointer events
  if (isWorkdaySplitDatePart(el)) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(40);

    // 1) Click like a real user at coordinates inside THIS element
    clickLikeUser(el, { bias: datePartBias(el) });
    await delay(20);

    // 2) If focus still got stolen (often to the year input), retry once
    const ae = (el.ownerDocument || document).activeElement;
    if (ae !== el) {
      clickLikeUser(el, { bias: datePartBias(el) });
      await delay(20);
    }

    // 3) Set value + events (no need for el.click())
    setValueWithNativeSetter(el, String(normVal));
    fireInputEvents(el, normVal);

    // Optional: a blur here sometimes auto-advances; but do it after value is committed
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    await delay(50);
    markAutofilled(el, 'choice');
    return;
  }


  // STANDARD INPUT
  console.log('filling standard inputs');
  simulateMouse(el);              // NEW
  el.focus();
  el.click();
  setValueWithNativeSetter(el, String(normVal)); //setting value
  fireInputEvents(el, normVal);
  el.blur(); 
  el.dispatchEvent(new Event('blur',{bubbles:true}));
  await delay(50);
  markAutofilled(el, 'choice');
  return;

}

export{fillInput};