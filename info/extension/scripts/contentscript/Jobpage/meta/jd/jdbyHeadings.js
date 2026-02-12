import { isVisible, txt, sanitize } from "../../../core/utils.js";
import { isLinkedInHost } from "../../../core/hosts.js";
import { jdLiDetailRoot } from "../linkedin/linkedIn.js";
import { HEADING_RE } from "./jdSelectors.js";
import { stripLabelishLines, cleanJDText } from "./jdHelpers.js";

function isHeadingCandidate(el) {
  if (!el) return false;
  if (el.tagName === 'LABEL' || el.closest('label')) return false;
  if (el.closest('form, fieldset, [role="form"], .form, .application-form')) return false;
  if (el.matches?.('[for]')) return false;
  if (el.querySelector?.('input,select,textarea,button')) return false;
  const t = (el.textContent || '').trim(); if (!t || t.length < 5) return false;
  if (!/^H[1-6]$/.test(el.tagName) && el.getAttribute('role') !== 'heading') {
    const s = getComputedStyle(el); const fs = parseFloat(s.fontSize) || 0; const fw = parseInt(s.fontWeight,10) || 400;
    if (fs < 14 && fw < 600) return false;
  }
  return HEADING_RE.test(t);
}

function collectJDByHeadings() {
  const arr = [];
  const root = isLinkedInHost() ? (jdLiDetailRoot() || document) : document;
  const nodes = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],div,legend,strong,b,span[role="heading"]'))
    .filter(isHeadingCandidate);
  for (const h of nodes) {
    const chunks = []; let sib = h.nextElementSibling, i = 0;
    // Optional (recommended): Increase heading merge tolerance to catch split JDs
    while (sib && i < 24) {
      if (/^H[1-6]$/.test(sib.tagName)) break;
      if (!sib.closest('form, fieldset, [role="form"], .form, .application-form') && isVisible(sib) && !sib.querySelector('input,select,textarea,button')) {
        chunks.push(sib.cloneNode(true));
      }
      sib = sib.nextElementSibling; i++;
    }
    const wrap = document.createElement('div'); chunks.forEach(n => wrap.appendChild(n));
    const raw = sanitize(txt(wrap)); const base = isLinkedInHost() ? raw : stripLabelishLines(raw);
    const t = cleanJDText(base); if (t) arr.push({ el: h, text: t, why: 'heading' });
  }
  return arr;
}

// Exports
export { isHeadingCandidate, collectJDByHeadings };
