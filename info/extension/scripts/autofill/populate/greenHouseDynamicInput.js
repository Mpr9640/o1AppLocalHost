// scripts/autofill/populate/greenHouseDynamicInput.js

import { waitForDomStable } from '../utils.js';

import { inputSelection } from '../inputandlabelextraction/input/mainInput.js';

import { attachSectionKindAndIndex } from '../groupingpayloadsanswers/addButton.js';

import { groupConsecutiveByGroupId } from '../groupingpayloadsanswers/grouping.js';

import {
  collectUnanswered,
  buildModelPayloadFromGrouped,
  buildPayloadForMappingAndActiveLearning
} from '../groupingpayloadsanswers/payloadBuilding.js';

import {
  hasUsableModelOutput,
  mapQuestionsToAnswers,
  attachModelValuesToGrouped
} from '../groupingpayloadsanswers/attachingModelAnswers.js';

import { callGemmaApi } from '../groupingpayloadsanswers/callingModel.js';

import { newPopulateFields } from './populateFields.js';

//starting code for dynamic greenhouse input helper
//Example usage for greenhouse dynamic input:
function isDependencyTrigger(item, el) {
  const t = ((el?.type || item?.elementType || '') + '').toLowerCase();

  if (t === 'radio' || t === 'checkbox') return true;
  if (t === 'select-one' || t === 'select') return true;

  // react-select / custom selects
  if (el?.classList?.contains('select__control')) return true;
  if (el?.getAttribute?.('role') === 'combobox') return true;

  // semantic dependency questions
  const q = (item?.question || item?.field?.humanName || '').toLowerCase();
  if (/(hispanic|ethnicity|veteran|disability|sponsorship|authorized|visa)/.test(q)) {
    return true;
  }

  return false;
}
async function microDeltaAutofill({ preKeys, autofillData}) { //, user_id 
  await waitForDomStable({ timeoutMs: 600, quietMs: 120 });

  const now = inputSelection();
  attachSectionKindAndIndex(now);

  const fresh = now.filter(x => {
    const k = makeStableKey(x);
    if (!k) return false;
    if (preKeys.has(k)) return false;
    if (x.element?.getAttribute?.('data-autofilled') === 'true') return false;
    return true;
  });

  if (!fresh.length) return;

  console.log('[delta-autofill] new fields detected:', fresh);

  // 🔥 Same pipeline, but ONLY for delta
  let grouped = groupConsecutiveByGroupId(fresh);

  const payload0 = buildPayloadForMappingAndActiveLearning(grouped, undefined, 'labels');
  const mapped = mapQuestionsToAnswers(payload0, autofillData);
  console.log('Answers coming from fieldmappings:',mapped);
  if (hasUsableModelOutput(mapped)) {
    grouped = attachModelValuesToGrouped(grouped, mapped);
  }
  
  let unanswered = collectUnanswered(grouped);
  if (unanswered.length) {
    const payload1 = buildModelPayloadFromGrouped(unanswered);
    let mo = null;
    try { mo = await callGemmaApi(payload1); } catch {}
    grouped = attachModelValuesToGrouped(grouped, mo);
  }
  console.log('Grouped in dyna:',grouped);
  await newPopulateFields(grouped, autofillData);
}
function makeStableKey(item) {
  // item is your parsed input object
  let h = item?.humanName;
  if (!h) return '';
  return h;
  /*
  // normalize aggressively but safely
  h = String(h)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')   // remove punctuation
    .trim();

  // optional: namespace by kind to avoid rare collisions
  //const kind = item?.kind || item?.elementType || 'field';

  //return `${kind}::${h}`; 
  //
  */
}
 //End code for dynamic greenhouse input helper


 export{isDependencyTrigger, microDeltaAutofill,makeStableKey};