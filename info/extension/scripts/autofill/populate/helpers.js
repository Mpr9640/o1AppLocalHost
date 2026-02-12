// scripts/autofill/populate/helpers.js
import { norm, normalize, delay } from '../utils.js';
import { markAutofilled } from '../resume/helpers.js';

function degreeAlias(a) {
  // normalize + collapse
  const t = a.toLowerCase();

  // common exact patterns
  if (/\b(bachelor|bachelors|b\.?s\.?|bsc|b\.?sc)\b/.test(t)) return 'bachelor';
  if (/\b(master|masters|m\.?s\.?|msc|m\.?sc)\b/.test(t)) return 'master';
  if (/\b(phd|ph\.?d|doctorate)\b/.test(t)) return 'phd';

  if (/\bb\.?tech\b|\bbachelor of technology\b/.test(t)) return 'bachelor technology';
  if (/\bb\.?e\b|\bbachelor of engineering\b/.test(t)) return 'bachelor engineering';
  if (/\bm\.?tech\b|\bmaster of technology\b/.test(t)) return 'master technology';
  if (/\bmba\b|\bmaster of business\b/.test(t)) return 'mba';

  return null;
}
//Using to avoid dom issues related to greenhouse country field.
const US_ALIASES = new Set([norm('usa'), norm('united states of america'), norm('u s a')]);
//Greenhouse location making it exact pattern for option select. 
const LOCATION_CITY_STATE_RE =
  /^\s*[a-zA-Z][a-zA-Z.\-'\s]*,\s[a-zA-Z][a-zA-Z.\-'\s]*\s*$/;

function fixGreenhouseCityState(raw, autofillData) {
  const s = String(raw ?? '').trim();
  if (!s) return `${autofillData?.residence_city}, ${autofillData?.residence_state}`;
  // If it already matches "city, state" with required space after comma -> ok
  if (LOCATION_CITY_STATE_RE.test(s)) {
    // normalize comma spacing to exactly ", "
    return s.replace(/\s*,\s*/g, ', ');
  }
  // If it's exactly "city,state" (no space) and looks otherwise valid -> fix spacing
  // e.g. "tampa,florida" -> "tampa, florida"
  if (/^[a-zA-Z][a-zA-Z.\-'\s]*,[a-zA-Z][a-zA-Z.\-'\s]*$/.test(s)) {
    return s.replace(/\s*,\s*/g, ', ');
  }

  // Anything else is risky ("tampa", "tampa fl", "tampa, fl") -> safe fallback
  return `${autofillData?.residence_city}, ${autofillData?.residence_state}`;
}
function simulatePointerClick(el) {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 16);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
  el.dispatchEvent(new MouseEvent('mousedown',    { bubbles: true, clientX: x, clientY: y }));
  el.dispatchEvent(new MouseEvent('mouseup',      { bubbles: true, clientX: x, clientY: y }));
  el.click();
  el.dispatchEvent(new PointerEvent('pointerup',  { bubbles: true, clientX: x, clientY: y }));
}

// Helper: Set value using native setter (bypasses React/framework controls)
function setValueWithNativeSetter(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  
  if (input.tagName === 'INPUT' && nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else if (input.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(input, value);
  } else {
    input.value = value;
  }
}
// --- tiny helper (mouse only) ---
function simulateMouse(el){
  const r = el.getBoundingClientRect();
  const x = Math.floor(r.left + r.width/2), y = Math.floor(r.top + Math.min(r.height/2, 12));
  const ev = (t)=>new MouseEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y});
  el.dispatchEvent(ev('mousedown'));
  el.dispatchEvent(ev('mouseup'));
  //el.dispatchEvent(ev('click'));
}

// --- updated: fires input+change, plus light keyboard fallback ---
function fireInputEvents(el, val){ 
  // try to hit editors that listen to beforeinput/input
  try{ el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertFromPaste',data:String(val)})); }catch{}
  try{ el.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,inputType:'insertFromPaste',data:String(val)})); }catch{
    el.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));
  }

  // tiny keyboard nudge (some UIs set dirty state on key events)
  el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));

  // finalizer most libs listen for
  el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
}


//step- New code for testing workday date to prevent clicking the wrong input(YYY) in same spin button
function clickLikeUser(el, { bias = 'center' } = {}) {
  if (!el) return false;
  const doc = el.ownerDocument || document;
  const win = doc.defaultView || window;

  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;

  // Pick a point inside the element. Left-bias helps when widgets have overlays.
  const x =
    bias === 'left'  ? (r.left + Math.min(10, r.width * 0.2)) :
    bias === 'right' ? (r.right - Math.min(10, r.width * 0.2)) :
                       (r.left + r.width / 2);

  const y = r.top + r.height / 2;

  // elementFromPoint is important: some widgets place a transparent overlay above the input.
  const target = doc.elementFromPoint(x, y) || el;

  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x, clientY: y,
    screenX: x, screenY: y,
    button: 0,
    buttons: 1,
    detail: 1  
  };

  // Pointer events first (modern React/Workday uses these a lot)
  if (typeof win.PointerEvent === 'function') {
    target.dispatchEvent(new win.PointerEvent('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  target.dispatchEvent(new win.MouseEvent('mousedown', base));

  if (typeof win.PointerEvent === 'function') {
    target.dispatchEvent(new win.PointerEvent('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  target.dispatchEvent(new win.MouseEvent('mouseup', base));
  target.dispatchEvent(new win.MouseEvent('click', base));

  // Programmatic events don't always move focus; do it explicitly.
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }

  return true;
}
// --- updated: checkbox/radio adds mouse + key fallback, minimal ---
async function checkElement(el, should){
  const type = (el.type||'').toLowerCase();
  if (type==='checkbox' || type==='radio'){
    if (el.checked !== !!should){
      simulateMouse(el);          // NEW
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.click?.();
      // tiny keyboard fallback
      el.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true})); // NEW
      el.dispatchEvent(new KeyboardEvent('keyup',{key:' ',bubbles:true}));   // NEW
      el.dispatchEvent(new Event('change',{bubbles:true}));
      //fireInputEvents(el,should);
    }
    await delay(50);
    markAutofilled(el, 'choice');
  }
}
// We are defining this code for checkrecruiters where we are reordering the final grouped for country first and than state
//Because state options are rendering after country choose.
//Start
function isCountryItem(it) {
  const h = normalize(it?.field?.humanName || it?.question);
  const idn = normalize(it?.field?.input_number || it?.input_number || '');
  return /\bcountry\b/.test(h) || /\bcountry\b/.test(idn);
}

function isStateItem(it) {
  const h = normalize(it?.field?.humanName || it?.question);
  const idn = normalize(it?.field?.input_number || it?.input_number || '');
  return /\bstate\b|\bprovince\b|\bregion\b/.test(h) || /\bstate\b|\bprovince\b/.test(idn);
}

function reorderCountryBeforeState(items) {
  // stable reorder: keeps everything else in the same relative order
  const arr = items.slice();

  const countryIdx = arr.findIndex(isCountryItem);
  const stateIdx   = arr.findIndex(isStateItem);

  if (countryIdx === -1 || stateIdx === -1) return arr;
  if (countryIdx < stateIdx) return arr; // already good

  // move country item just before state item
  const [country] = arr.splice(countryIdx, 1);
  const newStateIdx = arr.findIndex(isStateItem); // state index after removal
  arr.splice(newStateIdx, 0, country);
  return arr;
}

//End

export{US_ALIASES, fixGreenhouseCityState, LOCATION_CITY_STATE_RE, degreeAlias, simulatePointerClick, setValueWithNativeSetter,
  simulateMouse,fireInputEvents,clickLikeUser, checkElement,isCountryItem,isStateItem,reorderCountryBeforeState
};