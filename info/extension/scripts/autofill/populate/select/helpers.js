import {
  normalizeFieldNameWithSpace,
  delay,
  isVisible,
  isSuccessEuHost,
} from '../../utils.js';

import { setValueWithNativeSetter } from '../helpers.js';

// if degreeAlias is in resume/helpers.js (based on your structure)
import { degreeAlias } from '../helpers.js';

// You call collectOptionNodes() but it is NOT defined in this snippet.
// Import it from wherever you actually defined it:
import { collectOptionNodes } from './workdaySelectHelpers.js';


//===select helpers
function splitMultiValues(val) {
  return val.split(/[,;/|]+/).map(v => v.trim()).filter(Boolean);
}
function isComplexDropdown(el) {
  return (
    el.getAttribute('role') === 'combobox' ||
    el.closest('.MuiAutocomplete-root, .ant-select, .rc-select')
  );
}
//Step-  , New helpers for select semantic analysis, 


//Step-12, for filling select elements 
//input taking: labels,answer,humanName
//output: ok: true, labels,score
async function bestOptionMatch(labels, answer, { humanName = '', min = 0.62 } = {}) {
  const clean = s => normalizeFieldNameWithSpace(String(s || ''));

  // 1) quick local rules first
  const a = clean(answer);
  const L = labels.map(x => ({ raw: x, c: clean(x) })).filter(x => x.c);

  // exact / contains
  for (const x of L) {
    if (x.c === a) return { ok:true, label:x.raw, score:1, why:'exact' };
  }
  for (const x of L) {
    if (x.c.includes(a) || a.includes(x.c)) return { ok:true, label:x.raw, score:0.92, why:'contains' };
  }

  // degree-aware alias rules (cheap, super effective)
  const alias = degreeAlias(a);
  if (alias) {
    // try match alias tokens
    const best = pickByTokenScore(L, alias);
    if (best && best.score >= 0.78) return { ok:true, label:best.raw, score:best.score, why:'alias-token' };
  }

  // 2) local fuzzy
  const bestFuzzy = pickByFuzzy(L, a);   //L = option textcontent, a = answer
  if (bestFuzzy && bestFuzzy.score >= 0.78) {
    return { ok:true, label:bestFuzzy.raw, score:bestFuzzy.score, why:'fuzzy' };
  }

  // 3) embeddings via background/offscreen
  const r = await chrome.runtime.sendMessage({
    action: 'bestMatch',
    labels: labels.slice(0, 400), // safety cap
    answer: answer,
    //ctx : {humanName}
  });
  // Expect: {ok:true, label:"...", labelIndex:n, score:0.xx, method:"embed|exact|contains"}
  if (r?.ok && typeof r.label === 'string' && (r.score ?? 0) >= min) {
    console.log('checking label given by best match',r.label);
    return { ok:true, label: r.label, score: r.score, why: r.method || 'embed' };
  }
  
  // If embeddings were weak, fall back to best fuzzy anyway (but mark low)
  if (bestFuzzy) return { ok:true, label:bestFuzzy.raw, score:bestFuzzy.score, why:'fuzzy-low' };

  return { ok:false, reason:'no-match' };
}
function optionText(el){
  return (el.textContent || el.label || '').trim().toLowerCase();
}

// el which had options,  candidates means answers
function findOptionIndex(el, candidates){
  const opts = Array.from(el.options || []);
  // exact first, then contains
  for (const c of candidates){
    const idx = opts.findIndex(o => optionText(o) === c);
    if (idx >= 0) return idx;
  }
  for (const c of candidates){
    const idx = opts.findIndex(o => optionText(o).includes(c));
    if (idx >= 0) return idx;
  }
  // 2) local fuzzy
  const bestFuzzy = pickByFuzzy(L, a);   //L = option textcontent, a = answer
  if (bestFuzzy && bestFuzzy.score >= 0.78) {
    return { ok:true, label:bestFuzzy.raw, score:bestFuzzy.score, why:'fuzzy' };
  }


  return -1;
}

function pickByTokenScore(L, aliasText) {
  const want = new Set(aliasText.split(/\s+/).filter(Boolean));
  let best = null;

  for (const x of L) {
    const tokens = new Set(x.c.split(/\s+/).filter(Boolean));
    let hit = 0;
    for (const w of want) if (tokens.has(w)) hit++;
    const score = hit / Math.max(1, want.size);
    if (!best || score > best.score) best = { raw: x.raw, score };
  }

  if (!best) return null;
  // scale into same range as other scores
  best.score = 0.6 + 0.4 * best.score;
  return best;
}

function pickByFuzzy(L, a) {
  let best = null;
  for (const x of L) {
    const s = fuzzyScore(x.c, a); // you already have fuzzyScore
    if (!best || s > best.score) best = { raw: x.raw, score: s };
  }
  return best;
}

/**
 * Picks the best option using:
 * 1) exact/contains checks you already do (fast path)
 * 2) fuzzy score
 * 3) token score fallback
 * input: options el , answer, 
 * output: matching option element, score, 
 */
async function pickBestDropdownOption(options, valStr, ctx = {}) {
  const want = normalizeFieldNameWithSpace(valStr || "");
  if (!want) return null;

  // --- FAST PATH ---
  let target =
    options.find(opt => normalizeFieldNameWithSpace(opt.textContent || "") === want) ||
    options.find(opt => normalizeFieldNameWithSpace(opt.textContent || "").includes(want)) ||
    options.find(opt => want.includes(normalizeFieldNameWithSpace(opt.textContent || "")));

  if (target) return { raw: target, score: 1, why: "fast" };

  // --- LOCAL FUZZY PATH ---
  const L = buildOptionCandidates(options);
  if (!L.length) return null;

  const bestFuzzy = pickByFuzzy(L, want);      // {raw, score}
  const bestToken = pickByTokenScore(L, want); // {raw, score}

  let best = bestFuzzy;
  if (!best || (bestToken && bestToken.score > best.score)) best = bestToken;

  if (best) {
    const len = want.length;
    const minScore = len >= 10 ? 0.78 : 0.86;

    if (best.score >= minScore) return { ...best, why: "local-fuzzy" };
  }

  // --- OPTIONAL: BACKEND/LLM MATCH (only if local match not confident) ---
  // IMPORTANT: send STRINGS, not DOM nodes
  const labels = options
    .slice(0, 400)
    .map(o => normalizeFieldNameWithSpace(o.textContent || ""))
    .filter(Boolean);

  if (!labels.length) return null;

  //const min = (want.length >= 10) ? 0.78 : 0.86;

  let r = null;
  try {
    r = await chrome.runtime.sendMessage({
      action: "bestMatch",
      labels: labels,
      answer: valStr,
      //ctx
    });
  } catch (e) {
    console.warn("bestMatch sendMessage failed:", e);
    return best ? { ...best, why: "local-fuzzy-low" } : null;
  }

  // Expect: {ok:true, label:"...", labelIndex:n, score:0.xx, method:"embed|exact|contains"}
  if (r?.ok && Number.isFinite(r.labelIndex) && (r.score ?? 0) >= min) {
    const el = options[r.labelIndex];
    if (el) {
      return { raw: el, score: r.score, why: r.method || "embed" };
    }
  }
   
  // fallback to best local (even if low) or null
  return best ? { ...best, why: "local-fuzzy-low" } : null;
}

// Helper to wait for the dropdown to appear
async function waitForElement(selector, timeout = 1000, interval = 50) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}
function isClickableVisible(el){
  if (!isVisible(el)) return false;
  const cs = getComputedStyle(el);
  return cs.pointerEvents !== 'none';
}


function getCenter(el){
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2 };
}

function distance(a,b){ return Math.hypot(a.x - b.x, a.y - b.y); }

function fuzzyScore(txt, want){
  if (!txt || !want) return 0;
  if (txt === want) return 1;
  if (txt.startsWith(want)) return 0.9;
  if (txt.includes(want)) return Math.min(0.88, want.length / Math.max(txt.length, 1));
  // token overlap
  const A = new Set(txt.split(' ')), B = new Set(want.split(' '));
  let hit = 0; B.forEach(t => { if (A.has(t)) hit++; });
  return hit / Math.max(B.size, 1) * 0.7;
}

function getScrollableParent(node) {
  let el = node?.parentElement;
  while (el) {
    const st = getComputedStyle(el);
    const canScrollY = /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight;
    const canScrollX = /(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth;
    if (canScrollY || canScrollX) return el;
    el = el.parentElement;
  }
  return null;
}

function scrollOptionIntoListView(optionEl) {
  if (!optionEl) return;

  // page scroll (helps if list is offscreen)
  try { optionEl.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}

  // list-container scroll (helps when list has its own scroll)
  const scroller = getScrollableParent(optionEl);
  if (!scroller) return;

  const o = optionEl.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();

  if (o.top < s.top) scroller.scrollTop -= (s.top - o.top);
  else if (o.bottom > s.bottom) scroller.scrollTop += (o.bottom - s.bottom);
}

function clickOptionLike(optionEl) {
  if (!optionEl) return;

  scrollOptionIntoListView(optionEl);

  // Make it "active" for libraries that require hover
  optionEl.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
  optionEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
  optionEl.dispatchEvent(new MouseEvent("mouseover",  { bubbles: true, cancelable: true }));

  // Full click sequence
  optionEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
  optionEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  optionEl.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerType: "mouse" }));
  optionEl.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }));
  optionEl.dispatchEvent(new MouseEvent("click",     { bubbles: true, cancelable: true }));

  // Native click backup
  try { optionEl.click(); } catch {}

  // Some frameworks update on pointerup/click; "change" should be on the input, not ancestors,
  // so don't spam ancestors unless you *know* that widget needs it.
}
//Find the nearest visible listbox/menu to the anchor (button) within a radius.
async function waitForNearestListbox(anchor, timeout = 1200, radius = 700) {
  const start = performance.now();
  const anchorCenter = getCenter(anchor);

  const pick = () => {
    let candidates;
    if(isSuccessEuHost){
      candidates = [
      ...document.querySelectorAll('ul[role="listbox"]')
      ].filter(isVisible);
    }
    if(!candidates|| !candidates.length){
      // Common WD portals: role=listbox/menu, sometimes data-automation-id=listbox
      candidates = [
        ...document.querySelectorAll('[role="listbox"], [role="menu"], [data-automation-id="listbox"]')
      ].filter(isVisible);
    }
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = distance(anchorCenter, getCenter(c));
      if (d < bestD && d <= radius) { best = c; bestD = d; }
    }
    return best;
  };

  while (performance.now() - start < timeout) {
    const lb = pick();
    if (lb) return lb;
    await delay(40);
  }
  return null;
}




/* ---------------- helpers for select typing fallback ---------------- */

function findComboInputForListbox(listbox) {
  // React-select pattern: input[aria-controls="<listbox.id>"]
  const doc = listbox?.ownerDocument || document;
  const id = listbox?.id;
  if (!id) return null;

  return doc.querySelector(`input[aria-controls="${CSS.escape(id)}"]`);
}




// ✅ Updated: More robust Enter key simulation
async function typeIntoComboInput(input, text) {
  input.scrollIntoView({ block: 'center' });
  input.focus();
  input.click();

  await delay(30);

  // Clear existing value
  setValueWithNativeSetter(input, '');
  try { 
    input.dispatchEvent(new InputEvent('beforeinput', { 
      bubbles: true, 
      inputType: 'deleteContentBackward', 
      data: null 
    })); 
  } catch {}
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await delay(30);

  // Type new value
  setValueWithNativeSetter(input, String(text));
  try { 
    input.dispatchEvent(new InputEvent('beforeinput', { 
      bubbles: true, 
      inputType: 'insertText', 
      data: String(text) 
    })); 
  } catch {}
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  await delay(200);
}
function collectVisibleOptionNodes(listbox) {
  const opts = collectOptionNodes(listbox);
  const lbRect = listbox.getBoundingClientRect();

  // Only keep ones actually visible in the viewport of the listbox
  return opts.filter(o => {
    if (!o || !o.getBoundingClientRect) return false;
    const r = o.getBoundingClientRect();
    const verticallyVisible = r.bottom > lbRect.top + 2 && r.top < lbRect.bottom - 2;
    const notHidden = r.width > 0 && r.height > 0;
    return verticallyVisible && notHidden;
  });
}
function tryClosePopup(btn, listbox) {
  // If still expanded, try ESC first (less intrusive than body click)
  if (btn?.getAttribute('aria-expanded') === 'true') {
    listbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    listbox?.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Escape', bubbles: true }));
  }
  // If stubborn, click outside once
  if (btn?.getAttribute('aria-expanded') === 'true') {
    document.body.click();
  }
}

export {
  splitMultiValues,
  isComplexDropdown,
  bestOptionMatch,
  optionText,
  findOptionIndex,
  pickByTokenScore,
  pickByFuzzy,
  pickBestDropdownOption,
  waitForElement,
  isClickableVisible,
  getCenter,
  distance,
  fuzzyScore,
  getScrollableParent,
  scrollOptionIntoListView,
  clickOptionLike,
  waitForNearestListbox,
  findComboInputForListbox,
  typeIntoComboInput,
  collectVisibleOptionNodes,
  tryClosePopup
};