import { delay, normalizeFieldNameWithSpace } from '../../utils.js';
import { setValueWithNativeSetter } from '../helpers.js';
import { dispatchKey } from './smartRecruitersSelectHelpers.js';


//SuccsssEu start
//New typeintocombo code for successeu host, to avoid showing deafult instead of filtered options.
async function typeIntoComboInputForSuccessEu(input, text, list) {
  if (!input) return;

  try { input.scrollIntoView?.({ block: "center" }); } catch {}
  try { input.focus?.(); } catch {}

  // IMPORTANT: don't click again after focus (some UIs toggle/commit on click)
  await delay(30);

  // Clear like a user: Ctrl+A + Backspace, with key events
  await sendKey(input, "a", { ctrlKey: true });
  await sendKey(input, "Backspace");

  // Ensure internal state sees empty
  setValueWithNativeSetter(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  await delay(40);

  const s = String(text ?? "");
  let cur = "";

  for (const ch of s) {
    cur += ch;

    // keydown/keypress
    dispatchKeyForSuccessEu(input, "keydown", ch);
    dispatchKeyForSuccessEu(input, "keypress", ch);

    // incremental value update + input event (this is what UI5 listens to)
    setValueWithNativeSetter(input, cur);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: ch
    }));

    // keyup
    dispatchKeyForSuccessEu(input, "keyup", ch);

    // small jitter helps SAP UI components settle
    await delay(25);
  }

  // DO NOT dispatch 'change' here (it often commits & resets suggestions)
  // input.dispatchEvent(new Event("change"...)) <-- remove

  // Wait until listbox actually reflects the filter
  if (list) {
    await waitForFilteredOptions(list, s, 1400);
  } else {
    await delay(200);
  }
}
//For succesEu resulted options
async function waitForFilteredOptions(list, typedText, timeoutMs = 1200) {
  const normTyped = normalizeFieldNameWithSpace(typedText);
  const startHTML = list.innerHTML;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!list.isConnected) return false;

    const opts = [...list.querySelectorAll('[role="option"], li, div')]
      .map(o => normalizeFieldNameWithSpace(o.textContent || ""))
      .filter(Boolean);

    // Success condition A: we see an option that matches or contains typed text
    if (normTyped && opts.some(t => t.includes(normTyped))) return true;

    // Success condition B: list content changed (re-rendered results)
    if (list.innerHTML !== startHTML && opts.length) return true;

    await delay(60);
  }
  return false;
}
// For keyboard keys 
function dispatchKeyForSuccessEu(el, type, key, extra = {}) {
  try {
    el.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      ...extra
    }));
  } catch {}
}

async function sendKey(el, key, extra = {}) {
  dispatchKey(el, "keydown", key, extra);
  dispatchKey(el, "keypress", key, extra);
  dispatchKey(el, "keyup", key, extra);
  await delay(20);
}
//End successEu

export{sendKey,dispatchKeyForSuccessEu,waitForFilteredOptions,typeIntoComboInputForSuccessEu};