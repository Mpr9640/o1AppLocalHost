/**
 * scripts/atswatchers/reporting/observers.js
 * SPA navigation hooks (pushState / replaceState / popstate / hashchange),
 * MutationObserver, and debounced check scheduling.
 */

import { looksLikeSuccessPage } from '../detection/detector.js';
import { reportSuccess } from './reporter.js';

// ── Scheduling / debouncing ─────────────────────────────────────

let checking = false;   // in-flight gate to avoid run storms
let timer = null;       // debounce timer

async function runCheck() {
  if (checking) return;
  checking = true;
  try {
    if (await looksLikeSuccessPage()) await reportSuccess();
  } finally {
    checking = false;
  }
}

export const scheduleCheck = () => {
  clearTimeout(timer);
  timer = setTimeout(runCheck, 220);
};

// ── SPA navigation hooks ────────────────────────────────────────

export function patchHistory() {
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function () {
    const r = origPush.apply(this, arguments);
    scheduleCheck();
    return r;
  };

  history.replaceState = function () {
    const r = origReplace.apply(this, arguments);
    scheduleCheck();
    return r;
  };

  window.addEventListener('popstate', scheduleCheck, { passive: true });
  window.addEventListener('hashchange', scheduleCheck, { passive: true });
}

// ── DOM mutation observer ───────────────────────────────────────

export function startMutationObserver() {
  const mo = new MutationObserver(scheduleCheck);
  try {
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
  } catch {}
  return mo;
}

// ── Initial event listeners ─────────────────────────────────────

export function bindInitialEvents() {
  window.addEventListener('load', scheduleCheck, { once: true });
  document.addEventListener('DOMContentLoaded', scheduleCheck, { once: true });
}