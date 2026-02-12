// groupingpayloadsanswers/attachingModelAnswers.js
import {
  normQ,
  normalizeFieldNameWithSpace,
  normalizeFieldName,
} from '../utils.js';

import { fieldMappings, hasNegatives } from './helpers.js';

// helper: true only if we have at least one usable {question, answer}
function hasUsableModelOutput(modelOutputArray = []) {
  if (!Array.isArray(modelOutputArray) || modelOutputArray.length === 0) return false;

  for (const row of modelOutputArray) {
    const q = normQ(row?.question);
    if (!q) continue;

    const ans = parseModelAnswer(row?.answer);
    const asArr = toStringArray(ans).map(x => String(x).trim()).filter(Boolean);

    const noValue =
      ans == null ||
      asArr.length === 0 ||
      asArr.some(x => /i don'?t know|i do not know|null|unknown|n\/a/i.test(x));

    if (!noValue) return true; // at least 1 useful answer
  }
  return false;
}
function parseModelAnswer(answer) {
  // model gives answer like '["full_time"]' or '"yes"' or '[]' or null
  if (answer == null) return null;

  if (typeof answer !== 'string') {
    // already structured
    if (Array.isArray(answer)) return answer;
    return String(answer);
  }

  const s = answer.trim();

  // try JSON parse (handles '["x"]', '"x"', 'null', '[]')
  try {
    const v = JSON.parse(s);
    return v;
  } catch {
    // fallback: raw string
    return s;
  }
}

function toStringArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(x => String(x));
  if (typeof v === 'string') return [v];
  return [String(v)];
}


//Step-7: Attaching gemma Model values to grouped inputs
function attachModelValuesToGrouped(grouped, modelOutputArray) {
  // modelOutputArray should contain either:
  //  - { input_number: 12, answer: "..." } or
  //  - { input_number: 12, value: "..." }  (we support both)
  //  - for groups: answer/value can be string or array of strings

  const byId = buildAnswerMapByInputNumber(modelOutputArray);

  return grouped.map(item => {
    // -------- nonGroup (text/date/etc) --------
    if (item.kind === 'nonGroup') {
      const id = item.field?.input_number ||item.field?.question || item.field?.label ;
      if (id == null) return item;

      const ans = byId.get(String(id));
      const asArr = toStringArray(ans).map(x => x.trim()).filter(Boolean);

      const noValue =
        ans == null ||
        asArr.length === 0 ||
        asArr.some(x => /^(i don'?t know|i do not know|null|unknown|n\/a)$/i.test(x));

      const alreadyHasValue =
        item.field?.value != null && String(item.field.value).trim() !== "";

      // ✅ only set if model has a value AND current value is empty
      if (!noValue && !alreadyHasValue) {
        item.field.value = asArr[0];
      }
      console.log('Item in model:',item);
      return item;
    }

    // -------- group (checkbox/radio/select options) --------
    if (item.kind === 'group') {
      const id = item.input_number; // <-- group-level id (as you requested)
      if (id == null) return item;

      const ans = byId.get(String(id));
      const chosen = toStringArray(ans).map(normQ).filter(Boolean);

      if (chosen.length === 0) return item; // preserve existing item.value

      const optByNorm = new Map((item.options || []).map(o => [normQ(o.label), o]));

      const matched = [];
      for (const sel of chosen) {
        let hit = optByNorm.get(sel);
        if (!hit) {
          hit = (item.options || []).find(o => {
            const on = normQ(o.label);
            return on.includes(sel) || sel.includes(on);
          });
        }
        if (hit && !matched.includes(hit)) matched.push(hit);
      }

      // ✅ only set if we actually matched something
      if (matched.length > 0) {
        const alreadyHasValue = Array.isArray(item.value) && item.value.length > 0;
        if (!alreadyHasValue) {
          item.value = matched; // keeps your "option objects" format
        }
      }

      return item;
    }

    return item;
  });
}

/** Map input_number -> answer/value */
function buildAnswerMapByInputNumber(modelOutputArray) {
  const m = new Map();

  for (const row of (modelOutputArray || [])) {
    if (!row) continue;

    // tolerate a few shapes:
    const id =
      row.input_number ??
      row.inputNumber ??
      row.id ??
      row.input_id ??
      row.inputId?? row.question ?? row.label;
    //console.log('Id in buildanswer:',id);
    if (id == null) continue;

    const val =
      row.answer ??
      row.value ??
      row.output ??
      row.prediction ??
      row.suggested_answer;

    // store even if val is null; caller handles noValue
    m.set(String(id), val);
  }
  console.log('M in',m);
  return m;
}
//Step-10  For getting values through Fieldmapping 


// ===================== MAIN FUNCTION =====================
// params: (questions, autofillData)
// - questions: array of label strings (many questions)
// - autofillData: object containing values keyed by dataKey
// returns: array of { question, answer } where answer is value or null

function mapQuestionsToAnswers(questions = [], autofillData = {}) {
  const results = [];

  // normalize autofillData keys
  const normalizedData = {};
  for (const key in (autofillData || {})) {
    normalizedData[normalizeFieldName(key)] = autofillData[key];
  }
  autofillData = normalizedData;

  for (const qItem of (questions || [])) {
    const question = typeof qItem === "string" ? qItem : (qItem?.question || "");
    const input_number = typeof qItem === "string" ? null : (qItem?.input_number ?? null);

    const label = normalizeFieldNameWithSpace(question);
    let matchedKey = null;

    for (const mapping of fieldMappings) {
      const keywordHit = mapping.keywords?.some((rx) => rx.test(label));
      if (!keywordHit) continue;

      if (hasNegatives(label, mapping.dataKey)) continue;

      matchedKey = mapping.dataKey;
      break;
    }

    const answer =
      matchedKey && Object.prototype.hasOwnProperty.call(autofillData, matchedKey)
        ? autofillData[matchedKey]
        : null;

    results.push({ question, input_number, answer });
  }

  return results;
}

export {
  hasUsableModelOutput,
  parseModelAnswer,
  toStringArray,
  attachModelValuesToGrouped,
  buildAnswerMapByInputNumber,
  mapQuestionsToAnswers
};
