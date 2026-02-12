// Scripts/autofill.js (top-of-file imports)

// 0) Core utils (hosts + timing + dom-stable)
import {
  waitForDomStable,
  isSuccessEuHost,
  isLeverHost,
  isCheckwritersrecruitHost,
  delay,
} from "./autofill/utils.js"; // :contentReference[oaicite:1]{index=1}

// 1) Input collection / expand sections
import { inputSelection } from "./autofill/inputandlabelextraction/input/mainInput.js"; // :contentReference[oaicite:2]{index=2}
import { triggerExpandAllSections } from "./autofill/inputandlabelextraction/input/helpers.js"; // :contentReference[oaicite:3]{index=3}

// 2) Add-section automation (and section tagging)
import {
  processAddSectionsFromData,
  attachSectionKindAndIndex,
} from "./autofill/groupingpayloadsanswers/addButton.js"; // :contentReference[oaicite:4]{index=4}

// 3) Grouping + payload building + answer mapping
import { groupConsecutiveByGroupId } from "./autofill/groupingpayloadsanswers/grouping.js"; // :contentReference[oaicite:5]{index=5}
import {
  collectUnanswered,
  buildModelPayloadFromGrouped,
  buildPayloadForMappingAndActiveLearning,
} from "./autofill/groupingpayloadsanswers/payloadBuilding.js"; // :contentReference[oaicite:6]{index=6}
import {
  hasUsableModelOutput,
  mapQuestionsToAnswers,
  // NOTE: your code uses attachModelValuesToGrouped; it’s not listed in the doc,
  // but it likely lives in this same file—export it if needed.
  attachModelValuesToGrouped,
} from "./autofill/groupingpayloadsanswers/attachingModelAnswers.js"; // :contentReference[oaicite:7]{index=7}
import { callGemmaApi } from "./autofill/groupingpayloadsanswers/callingModel.js"; // :contentReference[oaicite:8]{index=8}

// 4) Resume flow
import { IS_SET1, waitForLeverResumeParsed } from "./autofill/resume/helpers.js"; // :contentReference[oaicite:9]{index=9} :contentReference[oaicite:10]{index=10}
import { newResumeFirstFromFinalGrouped } from "./autofill/resume/mainResume.js"; // :contentReference[oaicite:11]{index=11}

// 5) Final populate
import { reorderCountryBeforeState } from "./autofill/populate/helpers.js"; // :contentReference[oaicite:12]{index=12}
import { newPopulateFields } from "./autofill/populate/populateFields.js"; // :contentReference[oaicite:13]{index=13}

import { makeStableKey} from "./autofill/populate/greenHouseDynamicInput.js" 
/**
 * MISSING FROM THE DOC (you must import from wherever you defined these):
 * - pauseDetections(...)
 * - makeStableKey(...)
 *
 * The doc shows `stableKeyFor` in unUsed.js; if that’s your stable-key function, you can do:
 *   import { stableKeyFor as makeStableKey } from "./autofill/unUsed.js";
 * :contentReference[oaicite:14]{index=14}
 */

//===Global caches
//Config ======
console.log(
  '[JobAid] contentscript running on',
  location.href,
  'frame?', window.top !== window.self
);
window.addEventListener('error', (e) => console.error('[JA window.error]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[JA unhandledrejection]', e.reason));
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
//Styles ======
//import { waitForResumeParseNetworkFirst } from'./resumechecking.js';
const style = document.createElement('style');
style.textContent = `
  .autofill-highlight{ outline:2px solid gold !important; transition: outline .3s ease-out; }
  .autofill-drop-indicator{ outline:2px dashed #8aa; }
`;
document.head.appendChild(style);

//===Autofill
let autofillData = null;
//STEP O (AUTOFILLINIT)
let preKeys;
let AUTOFILL_ACTIVE = false;
async function autofillInit(tokenOrData, arg2 = null) {
  window.__JA_busyAutofill = true;
  //if(AUTOFILL_ACTIVE)  return;
  await chrome.runtime.sendMessage({ action: "setAutofillActive", active: true });
  //AUTOFILL_ACTIVE = true;
  pauseDetections(2000); // quiet period while we interact
  const looksLikeOpts = arg2 && typeof arg2 === 'object' && ('reentry' in arg2);
  const opts = looksLikeOpts ? (arg2 || {}) : null;
  const dataFromPopup = looksLikeOpts ? null : arg2;
  const data = dataFromPopup ?? tokenOrData;
  const reentry = !!opts?.reentry;
  console.log('[autofillInit] data:', data, 'reentry:', reentry);
  if (!data) { 
    console.log('[autofill] No data provided to autofillInit'); 
    return; 
  }
  autofillData = data;
  const user_id = autofillData["user_id"];
  await waitForDomStable({ timeoutMs: 1000, quietMs: 180 });
  if(isSuccessEuHost){
    await triggerExpandAllSections();
    // small wait for DOM to expand
    await new Promise(r => setTimeout(r, 300));
  } 
  const inputsInitial = inputSelection();
  attachSectionKindAndIndex(inputsInitial);
  await processAddSectionsFromData(autofillData, inputsInitial);
  // Wait for any new sections/rows to appear
  await waitForDomStable({ timeoutMs: 1000, quietMs: 180 });
  const inputs = inputSelection();
  preKeys = new Set(
    inputSelection().map(x => makeStableKey(x))
  );

  //console.log('hasOwn value?', inputs[0].hasOwnProperty('value'));
  //console.log('keys', Object.keys(inputs[0]));
  //console.log('descriptor', Object.getOwnPropertyDescriptor(inputs[0], 'value'));
  console.log('inputs going to parse for grouping',inputs);
  //console.log('snapshot inputs', JSON.parse(JSON.stringify(
    //inputs.map(({ element, ...rest }) => rest)
  //)));

  const grouped = groupConsecutiveByGroupId(inputs);
  console.log('Initial grouped:', grouped?.length, grouped);
  //console.log('snapshot inputs', JSON.parse(JSON.stringify(
   // inputs.map(({ element, ...rest }) => rest)
  //)));
  try {
    // 0) Start from grouped
    let current = grouped;
    // 1) FieldMappings (cheap/local)
    const payload0 = buildPayloadForMappingAndActiveLearning(current, undefined, "labels");
    const modelOutput0 = mapQuestionsToAnswers(payload0, autofillData);
    console.log('Answers coming from fieldmappings:',modelOutput0);
    // mapping is local & deterministic; attach if it returned anything
    if (hasUsableModelOutput(modelOutput0)) {
      current = attachModelValuesToGrouped(current, modelOutput0);
    }

    let unanswered = collectUnanswered(current);
    // 2) Gemma (ONLY for unanswered)
    if (unanswered.length) {
      const payload1 = buildModelPayloadFromGrouped(unanswered);
      console.log('Payload1 is',payload1);
      //console.log('Payload sending to gemma:',payload1);
      let modelOutput1 = null;
      try {
        //modelOutput1 = await callGemmaApi(payload1);
        console.log("Autofillinit func, chekcing modeloutput1 is attching values or not.")
        modelOutput1 = [
          
          { "input_number": 1, "question": "upload resume", "answer": "/uploads/ResumeGen0.pdf" },

          {
            "input_number": 2,
            "question": "please select one or more locations where you'd like to apply",
            "answer": ["san francisco,ca"]
          }, 
          {
            "input_number": 3,
            "question": "please select one or more locations where you'd like to apply",
            "answer": ["san francisco,ca"]

          },
          { "input_number": 3, "question": "name", "answer": "Sai Siva Reddy Maddula" },
          { "input_number": 4, "question": "email", "answer": "maddulasaisivareddy@gmail.com" },
          { "input_number": 5, "question": "phone number", "answer": "3614881962" },
          {
            "input_number": 6,
            "question": "website examples linkedin github portfolio",
            "answer": "https://www.linkedin.com/in/sai-siva-reddy-m-964504224/"
          },

          { "input_number": 7, "question": "password", "answer": "" },
          { "input_number": 8, "question": "confirm password", "answer": "" } 
        ]

        console.log('ModelOutput1:',modelOutput1);
      } catch (e) {
        modelOutput1 = null; // fail closed (skip attach)
      }
      current = attachModelValuesToGrouped(current, modelOutput1);
    }
    // ✅ FINAL: same format as grouped, with values attached from all fallbacks
    let finalGrouped = current;
    //Reordering country first and state next.
    if (isCheckwritersrecruitHost) {
      finalGrouped = reorderCountryBeforeState(finalGrouped);
    }
    console.log('finalGrouped:',finalGrouped.length,finalGrouped.slice(0,30));
    let didTryResume = false;
    // Normal resume-upload logic runs on final inputs
    if (!(reentry && IS_SET1)) {
      try {
        didTryResume = true;
        await newResumeFirstFromFinalGrouped(finalGrouped, autofillData, 500);
      } catch (e) {
        didTryResume = false;
        console.log('No file Input found:', e);
      }
    } else {
      console.log('[resume] re-entry on SET1 (iCIMS): skipping resume upload');
    }
    // ✅ Lever: wait until parsing finishes before filling other fields
    if (isLeverHost && didTryResume) {
      console.log('[lever] waiting for resume parse to finish...');
      const ok = await waitForLeverResumeParsed({ timeout: 12000 });
      console.log('[lever] resume parse wait result:', ok ? 'done' : 'timeout');
      // small settle time for final re-render
      await delay(250);
    }
    await newPopulateFields(finalGrouped, autofillData);
 
  } catch (e) {
    console.error('[JA] autofillInit crashed after grouping', e);
  } finally {
    window.__JA_busyAutofill = false;
    await chrome.runtime.sendMessage({ action: "setAutofillActive", active: false });
    //AUTOFILL_ACTIVE = false;
  }
  return;
}
 /* Problems: 1. Facing some issues with unanswered . it is considering some inputs which already had a value.
 2.  */

 export{autofillInit};