// groupingpayloadsanswers/addButtons.js (or addButton.js)
import {
  normalize,
  isElementVisible,
  waitForDomStable,
  isWorkableJobsHost,
  isApplyWorkableHost,
  isSuccessEuHost,
  isPaylocityHost,
  isSmartRecruitersHost,
} from '../utils.js';

import { nearestTextAround } from '../inputandlabelextraction/label/helpers.js';

const TITLE_BUCKETS = {
  education: ['education','school','college','university','degree','qualification'],
  experience: ['experience','employment','employment history','work history','company','job history','work experience'],
  languages: ['language','languages'],
  certifications: ['certification','certifications','license','licenses','credential','credentials'],
};
const SECTION_TO_DATAKEY = {
  education: 'educations',
  experience: 'experiences',
  languages: 'languages',
  certifications: 'certifications',
};

const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,[role="heading"],legend';
const TITLE_HINT_SEL = [
  'label','strong','span',
  '[data-automation-id*="Heading"]',
  '[data-automation-id*="Title"]',
  '[data-automation-id*="header"]',
  '[data-automation-id*="title"]'
].join(',');
//to find forms near fields.
const CONTAINER_UP_SEL = 'section,fieldset,form,article,div';
//function to return the text of an element
function textOf(el){ return (el?.textContent || '').trim(); }
function firstMatch(scope, sel){ try { return scope?.querySelector?.(sel) || null; } catch { return null; } }
function textFromAria(el, doc = document) {
  if (!el) return '';

  // 1️⃣ Direct aria-label
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();

  // 2️⃣ aria-labelledby on self
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/).filter(Boolean);
    const txt = ids
      .map(id => doc.getElementById(id)?.textContent || '')
      .join(' ')
      .trim();
    if (txt) return txt;
  }

  // 3️⃣ 🔥 DESCENDANT aria-label (CRITICAL for SuccessFactors)
  const ariaChild = el.querySelector('[aria-label]');
  if (ariaChild) {
    const childLabel = ariaChild.getAttribute('aria-label');
    if (childLabel) return childLabel.trim();
  }
  return '';
}

function resolveSectionTitleForAdd(btn, { maxHops = 4 } = {}){
  if (!btn) return '';
  const doc = btn.ownerDocument || document;
  let ariaTxt;
  if(isWorkableJobsHost || isApplyWorkableHost || isSuccessEuHost){
    ariaTxt = textFromAria(btn, doc);
    if (ariaTxt) return ariaTxt;
  }
  if (isPaylocityHost) {
    const btnText = btn.textContent.trim();
    console.log('btnText:',btnText);
    if (btnText) return btnText;
  }

  let node = btn.closest(CONTAINER_UP_SEL);
  let hops = 0;

  while (node && hops < maxHops){
    const legend = node.matches('fieldset') ? firstMatch(node, 'legend') : null;
    if (legend && textOf(legend)) return textOf(legend);

    const heading = firstMatch(node, HEADING_SEL);
    if (heading && textOf(heading)) return textOf(heading);

    // 🔹 SmartRecruiters: section titles live in <spl-typography-title data-test="section-title">
    if (isSmartRecruitersHost) {
      const srTitle = firstMatch(node, 'spl-typography-title[data-test="section-title"]');
      if (srTitle && textOf(srTitle)) return textOf(srTitle);
    }

    ariaTxt = textFromAria(node, doc);
    if (ariaTxt) return ariaTxt;

    const wdHint = firstMatch(node, TITLE_HINT_SEL);
    if (wdHint && textOf(wdHint)) return textOf(wdHint);

    // walk previous siblings
    let prev = node.previousElementSibling;
    while (prev){
      const prevHeading = prev.matches(HEADING_SEL) ? prev : firstMatch(prev, HEADING_SEL);
      if (prevHeading && textOf(prevHeading)) return textOf(prevHeading);

      if (isSmartRecruitersHost) {
        const prevSrTitle = prev.matches('spl-typography-title[data-test="section-title"]')
          ? prev
          : firstMatch(prev, 'spl-typography-title[data-test="section-title"]');
        if (prevSrTitle && textOf(prevSrTitle)) return textOf(prevSrTitle);
      }

      const prevLabelish = firstMatch(prev, TITLE_HINT_SEL);
      if (prevLabelish && textOf(prevLabelish)) return textOf(prevLabelish);

      const prevAria = textFromAria(prev, doc);
      if (prevAria) return prevAria;

      prev = prev.previousElementSibling;
    }

    node = node.parentElement?.closest?.(CONTAINER_UP_SEL) || node.parentElement;
    hops++;
  }

  return nearestTextAround(btn, 300) || '';
}

//finding add button with nearest titles.
function findAddButtonsWithTitles(root = document) {
  const CLICKABLE = [
    'button',
    '[role="button"]',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
    'oc-button',
    //'spl-button'
  ].join(',');

  const ADD_TEXT_RE = /\b(add|new|\+)\b/i;

  const candidates = [...root.querySelectorAll(CLICKABLE)].filter(el =>  ADD_TEXT_RE.test(el.textContent || el.getAttribute('aria-label') || '')); //isElementVisible(el) &&
  console.log('buttons found',candidates);
  return candidates.map(btn => {
    const titleText = resolveSectionTitleForAdd(btn, { maxHops: 6 }) || '';
    const controlsId = btn.getAttribute('aria-controls');
    const controlled = controlsId ? btn.ownerDocument.getElementById(controlsId) : null;
    const norm = normalize(titleText);
    console.log('findaddbuttonswithtitles,:',btn,norm,controlled);
    return { button: btn, rawTitle: titleText, normTitle: norm, controlled };
  });
}
//function to return add button section title is  edu/exp or none.
function titleToSectionKey(normTitle) {
  if (!normTitle) return null;
  for (const [key, keywords] of Object.entries(TITLE_BUCKETS)) {
    if (keywords.some(k => normTitle.includes(k))) return key;
  }
  return null;
}
async function safeClick(el) {
  if (!el) return false; // || !isElementVisible(el)
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 120));
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.click?.();
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  return true;
}
async function waitAfterExpand() {
  await waitForDomStable({ timeoutMs: 3000, quietMs: 180 });
  await new Promise(r => setTimeout(r, 60));
}
//function to return the opened inputs
function resolveNewContainer(candidate) {
  const modal = document.querySelector('[role="dialog"][aria-modal="true"], [data-automation-id*="promptPanel"], [data-automation-id*="modalDialog"]');
  if (modal && isElementVisible(modal)) return modal;
  if (candidate?.controlled && isElementVisible(candidate.controlled)) return candidate.controlled;
  return widenToInputCluster(candidate?.button || document.body);
}
//Returns new form fields.
function widenToInputCluster(anchor) {
  const containers = [
    anchor?.closest?.('section,fieldset,form,div,article'),
    document
  ].filter(Boolean);

  let best = containers[0] || document;
  let bestScore = -1;

  for (const c of containers) {
    const visibleInputs = [...c.querySelectorAll('input,select,textarea,[contenteditable="true"]')]
      .filter(isElementVisible).length;
    if (visibleInputs > bestScore) {
      bestScore = visibleInputs;
      best = c;
    }
  }
  //console.log('wideninputcluster best contiane for add button:',best);
  return best;
}


function countExisting(sectionKind, inputs) {
  return new Set(
    inputs
      .filter(i => i.sectionKind === sectionKind)
      .map(i => i.sectionIndex)
  ).size;
}

async function processAddSectionsFromData(autofillData, inputsInitial = null) {
  if (!autofillData || typeof autofillData !== 'object') {
    console.log('[AddRunner] No data to process.');
    return;
  }

  let addIndex = findAddButtonsWithTitles(document)
    .map(c => ({ ...c, sectionKey: titleToSectionKey(c.normTitle) }))
    .filter(c => !!c.sectionKey);

  if (!addIndex.length) {
    console.log('[AddRunner] No Add buttons with recognizable titles found.');
    return;
  }

  const plan = [];
  for (const c of addIndex) {
    const dataKey = SECTION_TO_DATAKEY[c.sectionKey];
    const arr = Array.isArray(autofillData[dataKey]) ? autofillData[dataKey] : [];
    const count = arr.length;
    if (count <= 0) continue;

    plan.push({
      sectionKey: c.sectionKey,
      dataKey,
      count,
      buttonRef: c.button,
      heading: c.rawTitle,
    });
  }
  console.log('[AddRunner] Plan:', plan);
  if (!plan.length) {
    console.log('[AddRunner] No sections have data; no clicks needed.');
    return;
  }

  const MAX_PER_SECTION = 10;

  for (const item of plan) {
    const { sectionKey, dataKey } = item;
    const arr = autofillData[dataKey];
    const desired = Math.min(arr.length, MAX_PER_SECTION);

    // NEW: use initial inputs to know how many instances already in DOM
    //const existing = countExistingByInputs(sectionKey, inputsInitial || []);
    const existing = countExisting(sectionKey, inputsInitial||[])

    const desiredClicks = Math.max(0, desired - existing);
    console.log(`[AddRunner] Section "${sectionKey}" → desired=${desired}, existing=${existing}, clicks=${desiredClicks}`);

    if (desiredClicks === 0) continue;

    let clicks = 0;
    while (clicks < desiredClicks) {
      const fresh = findAddButtonsWithTitles(document)
        .map(c => ({ ...c, sectionKey: titleToSectionKey(c.normTitle) }))
        .find(c => c.sectionKey === sectionKey);

      const btn = fresh?.button || item.buttonRef;
      if (!btn) {
        console.warn(`[AddRunner] Add button for "${sectionKey}" not found; stopping at ${clicks}/${desiredClicks}.`);
        break;
      }

      const clicked = await safeClick(btn);
      if (!clicked) {
        console.warn(`[AddRunner] Failed to click Add for "${sectionKey}".`);
        break;
      }
      await waitAfterExpand();

      const container = resolveNewContainer(fresh);
      if (!container) {
        console.warn(`[AddRunner] Could not resolve new container after Add for "${sectionKey}".`);
        break;
      }

      // NOTE: no per-item populate here — the global populateFields() will handle it later
      clicks += 1;
    }
  }
}
// ---------- Helpers to materialize mappings for a known section ----------
function sectionToPrefix(sectionKey){
  return sectionKey === 'education' ? 'educations'
       : sectionKey === 'experience' ? 'experiences'
       : sectionKey; // languages/certifications if you later add address for them
}

// Strip leading "<prefix>[x]." or "educations[x]." to a relative key
function toRelativeKey(dataKey, sectionKey){
  const prefix = sectionToPrefix(sectionKey);
  return dataKey
    .replace('{prefix}', prefix)
    .replace(/^educations\[x]\./, '')
    .replace(/^experiences\[x]\./, '')
    .replace(new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\[x]\\.'), '');
}
// We only treat inputs inside these as "repeated-section blocks"
const BLOCK_ROOT_SEL = 'fieldset,[role="group"],form,section,article';

function findBlockRootForInput(el) {
  if (!el) return null;
  // IMPORTANT: we do NOT fall back to <div> or document.body
  const root = el.closest(BLOCK_ROOT_SEL);
  return root || null;           // null => this input is not in a repeated block
}

function resolveBlockTitle(root) {
  if (!root) return '';

  const doc = root.ownerDocument || document;

  // 1) fieldset legend
  if (root.tagName === 'FIELDSET') {
    const legend = root.querySelector('legend');
    if (legend?.textContent) return legend.textContent.trim();
  }

  // 2) heading-like inside the root
  const headingInside = firstMatch(root, HEADING_SEL) || firstMatch(root, TITLE_HINT_SEL);
  if (headingInside && textOf(headingInside)) return textOf(headingInside);

  // 3) aria-label / aria-labelledby on the root
  const aria = textFromAria(root, doc);
  if (aria) return aria;

  // 4) previous sibling headings/labels
  let prev = root.previousElementSibling;
  while (prev) {
    const prevHeading = prev.matches(HEADING_SEL)
      ? prev
      : firstMatch(prev, HEADING_SEL);
    if (prevHeading && textOf(prevHeading)) return textOf(prevHeading);

    const prevLabelish = firstMatch(prev, TITLE_HINT_SEL);
    if (prevLabelish && textOf(prevLabelish)) return textOf(prevLabelish);

    const prevAria = textFromAria(prev, doc);
    if (prevAria) return prevAria;

    prev = prev.previousElementSibling;
  }

  return '';
}

function classifyBlockKind(root, blockInputs) {
  if (!root) return null;

  // 1) Prefer the block title (legend/heading/etc.)
  const rawTitle = resolveBlockTitle(root);
  const normTitle = normalize(rawTitle);

  if (normTitle) {
    for (const [key, keywords] of Object.entries(TITLE_BUCKETS)) {
      if (keywords.some(k => normTitle.includes(k))) {
        return key;  // 'education' | 'experience' | 'languages' | 'certifications'
      }
    }
  }

  // 2) Fallback: combine a few field labels
  const joinedLabels = normalize(
    blockInputs
      .slice(0, 6)
      .map(o => o.humanName || '')
      .join(' ')
  );

  if (joinedLabels) {
    for (const [key, keywords] of Object.entries(TITLE_BUCKETS)) {
      if (keywords.some(k => joinedLabels.includes(k))) {
        return key;
      }
    }
  }

  return null; // unknown / non-repeated section
}

/**
 * inputs: array of { element, groupId, humanName, ... }
 * Mutates each object:
 *    sectionKind: 'education' | 'experience' | 'languages' | 'certifications' | null
 *    sectionIndex: 0,1,2,... or null
 */

//STEP3- Finding forms and attaching section and index

function attachSectionKindAndIndex(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) return;

  // 1) Ensure clean slate
  for (const obj of inputs) {
    obj.sectionKind = null;
    obj.sectionIndex = null;
  }

  // 2) Build blocks based on BLOCK_ROOT_SEL containers
  const blocks = [];
  let currentBlock = null;

  for (const obj of inputs) {
    const root = findBlockRootForInput(obj.element);

    // Inputs NOT in any allowed root: leave sectionKind/index = null
    if (!root) {
      continue;
    }

    // If this is the first root or we moved to a different root, start a new block
    if (!currentBlock || currentBlock.root !== root) {
      currentBlock = { root, inputs: [] };
      blocks.push(currentBlock);
    }

    currentBlock.inputs.push(obj);
  }

  if (!blocks.length) return; // nothing to classify

  // 3) Assign sectionKind per block + running index per kind
  const counters = {
    education: 0,
    experience: 0,
    languages: 0,
    certifications: 0
  };

  for (const block of blocks) {
    const kind = classifyBlockKind(block.root, block.inputs);

    // If we couldn't classify this block, keep its inputs as null
    if (!kind || !(kind in counters)) {
      for (const obj of block.inputs) {
        obj.sectionKind = null;
        obj.sectionIndex = null;
      }
      continue;
    }

    const idx = counters[kind]++;
    for (const obj of block.inputs) {
      obj.sectionKind = kind;
      obj.sectionIndex = idx;
    }
  }
}

export {
  TITLE_BUCKETS,
  SECTION_TO_DATAKEY,
  HEADING_SEL,
  TITLE_HINT_SEL,
  CONTAINER_UP_SEL,
  textOf,
  firstMatch,
  textFromAria,
  resolveSectionTitleForAdd,
  findAddButtonsWithTitles,
  titleToSectionKey,
  safeClick,
  waitAfterExpand,
  resolveNewContainer,
  widenToInputCluster,
  countExisting,
  processAddSectionsFromData,
  sectionToPrefix,
  toRelativeKey,
  classifyBlockKind,BLOCK_ROOT_SEL,findBlockRootForInput,resolveBlockTitle,attachSectionKindAndIndex
};