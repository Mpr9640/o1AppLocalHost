import { isAshbyHost } from '../../utils.js';

//===ashby helpers

function isAshbyButtonEntry(obj){
  return !!(obj && obj.ashbyLinked && obj.optionText && obj.element?.tagName === 'BUTTON');
}

// --- helpers (Ashby only) ---
function ashbyQuestionTextFor(node){
  if (!isAshbyHost || !node) return '';
  const entry = node.closest('[class*="application-form-field-entry"]') || node.closest('div');
  const lab = entry?.querySelector('label[class*="application-form-question-title"], label[for]');
  return (lab?.textContent || '').replace(/\s*[:*]\s*$/, '').trim();
}

function ashbyFindYesNoButtonsNear(input){
  if (!isAshbyHost || !input) return [];
  const entry = input.closest('[class*="application-form-field-entry"]') || input.closest('div');
  if (!entry) return [];
  // Ashby wraps the two buttons in a container with "yesno" in the class
  const yesNo = entry.querySelector('div[class*="yesno"]');
  if (!yesNo) return [];
  const btns = [...yesNo.querySelectorAll('button')].filter(b => b && b.offsetParent !== null);
  // keep only obvious yes/no
  return btns
    .map(b => ({ el: b, text: (b.textContent || '').trim().toLowerCase() }))
    .filter(b => b.text === 'yes' || b.text === 'no');
}

export {
  isAshbyButtonEntry,
  ashbyQuestionTextFor,
  ashbyFindYesNoButtonsNear
};
