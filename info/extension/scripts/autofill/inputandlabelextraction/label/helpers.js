// @ts-nocheck

import {
  normalizeFieldNameWithSpace,
  isElementVisible,
  isLeverHost,
  stripRequiredAsterisk,
} from '../../utils.js';



//Finding associated label
function findAssociatedLabel(el){
  if (!el) return '';
  if (el.id){
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab?.textContent) return lab.textContent.trim();
  }
  return '';
}

// Finding nearest label fallback
function textNodeCenterRect(node) {
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  const rects = range.getClientRects();
  range.detach?.();
  if (!rects || rects.length === 0) return null;
  let best = rects[0];
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    if (r.width * r.height > best.width * best.height) best = r;
  }
  return best;
}
function getExplicitLabels(el) {
  const doc = el.ownerDocument;
  const out = [];
  if (el.labels && el.labels.length) {
    for (const lab of el.labels) {
      const t = (lab.textContent || '').trim();
      if (t) out.push(t);
    }
  } else {
    let p = el.parentElement;
    while (p) {
      if (p.tagName === 'LABEL') {
        const t = (p.textContent || '').trim();
        if (t) out.push(t);
        break;
      }
      p = p.parentElement;
    }
  }
  const addByIds = (attr) => {
    const ids = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const n = doc.getElementById(id);
      if (n) {
        const t = (n.textContent || '').trim();
        if (t) out.push(t);
      }
    }
  };
  addByIds('aria-labelledby');
  addByIds('aria-describedby');

  if (el.placeholder) out.push(el.placeholder);
  if (el.title) out.push(el.title);

  return out;
}
function nearestTextAround(el, px = 220, { includeIframes = false } = {}) {
  if (!el) return '';

  const explicit = getExplicitLabels(el)
    .map(normalizeFieldNameWithSpace)
    .find(Boolean);
  if (explicit) return explicit;

  const root = el.getRootNode?.() || el.ownerDocument || document;
  const doc = root.nodeType === 9 ? root : (root.ownerDocument || document);

  const er = el.getBoundingClientRect();
  const ecx = er.left + er.width / 2;
  const ecy = er.top + er.height / 2;

  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const raw = node.nodeValue || '';
        if (!raw.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let bestTxt = '';
  let bestScore = Infinity;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const rect = textNodeCenterRect(node);
    if (!rect) continue;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = cx - ecx;
    const dy = cy - ecy;
    const dist = Math.hypot(dx, dy);
    if (dist > px) continue;

    let bias = 0;
    if (cx > ecx) bias += 18;
    if (cy > ecy) bias += 9;
    if (Math.abs(dy) < 10) bias -= 6;

    const score = dist + bias;
    if (score < bestScore) {
      bestScore = score;
      bestTxt = (node.nodeValue || '').trim();
    }
  }

  if (!bestTxt && includeIframes) {
    for (const iframe of doc.querySelectorAll('iframe')) {
      try {
        const idoc = iframe.contentDocument;
        if (!idoc) continue;
        const walker2 = idoc.createTreeWalker(
          idoc,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const raw = node.nodeValue || '';
              if (!raw.trim()) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName;
              if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
              if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          },
          false
        );

        let best2 = Infinity, txt2 = '';
        while (walker2.nextNode()) {
          const node = walker2.currentNode;
          const rect = textNodeCenterRect(node);
          if (!rect) continue;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = cx - ecx;
          const dy = cy - ecy;
          const dist = Math.hypot(dx, dy);
          if (dist > px) continue;
          let bias = 0;
          if (cx > ecx) bias += 18;
          if (cy > ecy) bias += 9;
          if (Math.abs(dy) < 10) bias -= 6;
          const score = dist + bias;
          if (score < best2) {
            best2 = score;
            txt2 = (node.nodeValue || '').trim();
          }
        }
        if (txt2) bestTxt = txt2;
      } catch (e) {}
    }
  }

  const norm = normalizeFieldNameWithSpace(bestTxt);
  //console.log('[nearestTextAround]', norm);
  return norm;
}
// treat very machiney `name=` values as last resort
function looksMachineName(s){
  if(!s) return false;
  if(/cards?\[/.test(s)) return true;                          // Lever custom questions
  if(/[a-f0-9]{8}-[a-f0-9-]{13,}/i.test(s)) return true;       // UUID-ish
  if(/\b(field|input|question)\d+\b/i.test(s)) return true;
  // accept obvious good keys
  if (/\b(email|phone|name|first|last|company|location|address|city|state|zip|linkedin|github|portfolio|website)\b/i.test(s)) {
    return false;
  }
  return /^[a-z0-9_\[\]\-]+$/i.test(s);                        // no spaces ⇒ likely a key
}

// =====================
// Lever-specific: pull the visible question text
// =====================
const leverQuestionCache = new WeakMap();
function leverQuestionTextFor(field){
  if(!isLeverHost || !field) return '';
  const li = field.closest('li.application-question');
  if(!li) return '';
  if(leverQuestionCache.has(li)) return leverQuestionCache.get(li);

  const txtEl = li.querySelector('.application-label .text, .application-label');
  let txt = txtEl?.textContent || '';
  txt = stripRequiredAsterisk(txt).trim();

  // cache per <li> to avoid re-walking
  leverQuestionCache.set(li, txt);
  return txt;
}

// =====================
// Name extraction (UPDATED)
// =====================

function njoynOptionTextAfterInput(input) {
  const doc = input.ownerDocument || document;
  const parts = [];
  let node = input.nextSibling;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      // stop at next input or line break
      if (tag === 'INPUT' || tag === 'BR') break;
      const txt = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (txt) parts.push(txt);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (txt) parts.push(txt);
    }
    node = node.nextSibling;
  }

  return parts.join(' ').trim();
}

 // Step-2, HumanName extraction
//Function for smartrecruiters file name finfing because of the file heading is in shadow root.
//we are defining a specific host code, if we want we can update findfilefield name go beyong for shadowroots to find name.
function smartRecruitersFileLabelFor(field) {
  const root = field.getRootNode?.();
  const host = root?.host; // e.g., spl-dropzone
  const container =
    (host?.closest?.('[data-test$="upload-container"], [data-test*="upload-container"], [data-test="resume-upload-container"]')) ||
    (field.closest?.('[data-test$="upload-container"], [data-test*="upload-container"], [data-test="resume-upload-container"]')) ||
    null;
  if (!container) return '';
  // Title component (contains "Resume" in its shadow root)
  const titleEl = container.querySelector('[data-test="section-title"], spl-typography-title');
  if (!titleEl) return '';

  // Read shadow text if present; otherwise fallback to light DOM text
  const txt = (titleEl.shadowRoot?.textContent || titleEl.textContent || '').trim();
  return txt;
}



export {nearestTextAround,getExplicitLabels,textNodeCenterRect, findAssociatedLabel, looksMachineName,
  leverQuestionCache,leverQuestionTextFor,njoynOptionTextAfterInput,smartRecruitersFileLabelFor
};