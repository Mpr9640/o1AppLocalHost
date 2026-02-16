import { safeURL, debounce, waitForDomStable } from "./contentscript/core/utils.js";
import { isLinkedInHost } from "./contentscript/core/hosts.js";

import { showIcon, requestShowIcon } from "./contentscript/icon/showIcon.js";
import { requestRemoveIcon, teardownJobAidUI } from "./contentscript/icon/teardownUi.js";

import {
  initApplyClickMonitor,
  canonicalScore,
  hasTitleCompanyLocation,
  pushJobContext
} from "./contentscript/jobcontext/jobContext.js";

import { getJobDescriptionText } from "./contentscript/Jobpage/meta/jd/jdMain.js";
import { displayMatchingPerecentage } from "./contentscript/Jobpage/meta/jd/jdDisplaying.js";

import { detectJobPage } from "./contentscript/Jobpage/detection.js";
import { runDetectionNow } from "./contentscript/scanandRunDetection.js";

import { hasApplySignals } from "./contentscript/Jobpage/findingHelpers.js";

import { getJobTitleStrict } from "./contentscript/Jobpage/meta/jobtitle/jobTitle.js";
import { getCompanyName } from "./contentscript/Jobpage/meta/jobcompany/jobCompanyMain.js";
import { getLocationText } from "./contentscript/Jobpage/meta/joblocation/jobLocationMain.js";
import { getCompanyLogoUrl } from "./contentscript/Jobpage/meta/jobicon/jobIconMain.js";

import { getLinkedInActiveCardMeta} from "./contentscript/Jobpage/meta/linkedin/linkedIn.js";
import { getGenericActiveCardMeta } from "./contentscript/Jobpage/meta/generichostslists/genericHostsLists.js";

import { initAutofillReentry } from "./contentscript/reAutofill.js";
import { IS_TOP_WINDOW, ROLE_PARSE } from "./contentscript/icon/position.js";

//# 0c) UI lock + geometry helpers (ADD THIS)
// Per-origin + per-path UI lock to prevent double icons when same-origin iframes also run the script
const __JA_FRAME_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const __JA_LOCK_KEY = `__jobAidUiLock__::${location.origin}::${(safeURL(location.href)?.pathname || '/')}`;

import { JA_STATE, resetContentState } from "./contentscript/core/state.js";

// ---- Journey: freeze canonical snapshot when Apply/Interested is clicked
initApplyClickMonitor({
  hasTitleCompanyLocation,
  getJobDescriptionText,
  canonicalScore,
  getJobTitleStrict,
  getCompanyName,
  getLocationText,
  getCompanyLogoUrl,

  // keep same runtime messages but wrapped so module stays clean
  sendJourneyStart: (snapshot) =>
    chrome.runtime.sendMessage({ action: "journeyStart", snapshot }),

  noteFirstJobUrl: (url) =>
    chrome.runtime.sendMessage({ action: "noteFirstJobUrl", url }),
});
 
/*
// Example gating

// ---- global gates ----
window.__JA_busyAutofill = false;   // true while autofill runs
let __JA_pauseUntil = 0;

function pauseDetections(ms = 1200) {
  __JA_pauseUntil = Math.max(__JA_pauseUntil, performance.now() + ms);
}
function shouldPauseDetections() {
  return window.__JA_busyAutofill || performance.now() < __JA_pauseUntil;

}
//New 

function shouldPauseDetections(){
  refreshAutofillState();
  if (AUTOFILL_ACTIVE){
    console.log('we got autofill as active');
    return true;
  }
  else{console.log('we got autofill as Inactive');return false};

}

async function refreshAutofillState() {
  try {
    const res = await chrome.runtime.sendMessage({ action: "getAutofillActive" });
    AUTOFILL_ACTIVE = !!res?.active;
  } catch {
    AUTOFILL_ACTIVE = false;
  }
} 

*/
// ---- global gates ----
window.__JA_busyAutofill = window.__JA_busyAutofill || false;
let __JA_pauseUntil = 0;

function pauseDetections(ms = 1200) {
  __JA_pauseUntil = Math.max(__JA_pauseUntil, performance.now() + ms);
}

// background/tab mirror (fast sync read)
let AUTOFILL_ACTIVE = false;

// SINGLE source of truth for gating (SYNC)
function shouldPauseDetections() {
  return !!window.__JA_busyAutofill || AUTOFILL_ACTIVE || performance.now() < __JA_pauseUntil;
}

// one-time pull (ONLY ON INIT / VISIBILITY)
async function refreshAutofillStateOnce() {
  try {
    const res = await chrome.runtime.sendMessage({ action: "getAutofillActive" });
    AUTOFILL_ACTIVE = !!res?.active;
  } catch {
    AUTOFILL_ACTIVE = false;
  }
}


// Debounced wrapper for all triggers
//const runDetection = debounce(runDetectionNow, 350);
// Debounced runner
const runDetection = debounce(() => { if (!shouldPauseDetections()) runDetectionNow(); }, 350);


// ====== Init / Observers (install once) ======
(function initOnce() {

  // Initial pull once
  refreshAutofillStateOnce();

  // Keep fresh when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAutofillStateOnce();
  }); 

  // Initial kick
  runDetection();

  // History patch (install once)
  if (!window.__JA_histPatched__) {
    window.__JA_histPatched__ = true;
    const p = history.pushState, r = history.replaceState;
    const bump = () => requestAnimationFrame(runDetection); // let DOM render the new view
    history.pushState = function(...a){ const x = p.apply(this, a); bump(); return x; };
    history.replaceState = function(...a){ const x = r.apply(this, a); bump(); return x; };
    window.addEventListener('popstate', bump, { passive: true });
    window.addEventListener('hashchange', bump, { passive: true });
  }

  // Observers (install once)
  if (!window.__JA_obs__) {
    window.__JA_obs__ = true;

    // Scope to document by default; if you can, narrow to list/detail root
    //const target = document;
    //new MutationObserver(() => runDetection()).observe(target, { childList: true, subtree: true });

    // Focus changes inside list/detail panes often indicate active-card change
    //document.addEventListener('focusin', () => runDetection(), { capture: true, passive: true });

    // In two-pane layouts, visible card changes on scroll
    //window.addEventListener('scroll', () => runDetection(), { passive: true });

    // Observers/listeners (unchanged wiring, but guard inside handlers)
    new MutationObserver(() => { if (!shouldPauseDetections()) runDetection(); })
      .observe(document, { childList: true, subtree: true });

    addEventListener('scroll', () => { if (!shouldPauseDetections()) runDetection(); }, { passive: true });
    document.addEventListener('focusin', () => { if (!shouldPauseDetections()) runDetection(); }, { capture: true, passive: true });

    // Keep fresh when tab becomes visible / on load
    window.addEventListener('load', runDetection);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) runDetection(); });
  }
})();


/* =========================
   8) Messaging API
   ========================= */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'JA_RENDER_ICON_TOP') {
    if (!IS_TOP_WINDOW) return;
    requestShowIcon;
  }
  
  if (request.action === 'JA_REMOVE_ICON_TOP') {
    requestRemoveIcon?.();
  }
  if (request?.action === "JA_REFRESH_APPLIED_TOP") {
    const { jobKey, url } = request.payload || {};
    // Only top should do this
    maybeRefreshApplied(window.__JobAidIconEl, { jobKey, url });
  }

  if (request.action === 'forceScanNow') {
    (async () => { try{await runDetectionNow(); sendResponse?.({ ok: true, jobKey: JA_STATE.currentJobKey, url: location.href });} catch(e){sendResponse?.({ ok: false, error: String(e?.message || e), url: location.href });}})();
    return true;
  }
  
  if (request?.action === "setAutofillActive") {
    AUTOFILL_ACTIVE = !!request.active;
    // optional: also reflect into window flag
    window.__JA_busyAutofill = AUTOFILL_ACTIVE;
  }
  
  if (request.action === 'getDetectionState') {
    // on-demand quick read (re-run a lightweight detect without side-effects)
    (async () => {
      try {
          const det = await detectJobPage();
          sendResponse?.(det);
        } catch (e) {
          sendResponse?.({ ok: false, error: String(e?.message || e) });
        }
      })().catch(e => {
        // Final safety so Chrome never complains about the channel
        sendResponse?.({ ok: false, error: String(e?.message || e) });
    });
    return true;
  }
  if (request.action === 'hasJD') {
    (async () => {
      const { text } = await getJobDescriptionText();
      sendResponse({ ok: !!(text && text.length > 120) });
    })();
    return true;
  }
  if (request.action === 'getCanonicalScore') {
    (async () => {
      const hasApply = hasApplySignals();
      const hasTCL = hasTitleCompanyLocation();
      const { text: jdText } = await getJobDescriptionText();
      const score = canonicalScore({ hasApply, hasTCL, hasJD: !!(jdText && jdText.length > 120) });
      sendResponse({
        score,
        title: getJobTitleStrict(),
        company: getCompanyName(),
        location: getLocationText(),
        logoUrl: getCompanyLogoUrl(),
        url: location.href
      });
    })();
    return true;
  }

  if (request.action === 'displayPercentage' && typeof request.percentage === 'number') {
    //matchedWords = request.matchedWords || [];
    JA_STATE.matchedWords.length = 0;
    JA_STATE.matchedWords.push(...(request.matchedWords || []));
    JA_STATE.percentage = request.percentage || 0;
    JA_STATE.allSkills.length = 0;
    if (Array.isArray(request.allSkills)) JA_STATE.allSkills.push(...request.allSkills);
   // percentage = request.percentage || 0;
    //if (Array.isArray(request.allSkills)) allSkills = request.allSkills;
    // Only render banner if we’re on a MEDIUM/HIGH page (icon present implies allowUI)
    //if (!document.getElementById('jobAidIcon')) return true;
    // IMPORTANT: never return true without responding
    //console.log('1. In contentscript.js getskillmatchstate percentage,matchedwords and allskills:',percentage,matchedWords,allSkills);
    if (!document.getElementById('jobAidIcon')) {
      sendResponse?.({ status: 'no_ui' }); // <— respond
      return; // sync
    }
    //displayMatchingPerecentage(percentage, matchedWords);
    displayMatchingPerecentage(JA_STATE.percentage, JA_STATE.matchedWords);
    sendResponse?.({ status: 'success' });
    return; // true;
  }
  if (request.action === 'openSkillsPanel'){
    //if (jdAnchorEl) 
    if(JA_STATE.jdAnchorEl){
      // 1) Reply immediately so popup sees ok:true.
      sendResponse?.({ ok: true, where: 'jd' });
      // 2) Do the visual work asynchronously.
      setTimeout(() => {
        try {
          JA_STATE.jdAnchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          JA_STATE.jdAnchorEl.style.transition = 'box-shadow 0.6s ease';
          const prev = JA_STATE.jdAnchorEl.style.boxShadow;
          JA_STATE.jdAnchorEl.style.boxShadow = '0 0 0 3px rgba(235, 37, 37, 0.35)';
          setTimeout(() => { JA_STATE.jdAnchorEl.style.boxShadow = prev || 'none'; }, 1500);
        } catch {}
      }, 0);
      return true; // keep port open while we run the async side effect (safe, even though we already replied)
    } 
    const host = document.getElementById('jobAidSkillBannerHost');
    if (host) {
      sendResponse?.({ ok: true, where: 'banner' });
      setTimeout(() => {
        try { host.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }, 0);
      return true;
    }
    // This is the failure path.
    //console.error('openSkillsPanel failed: No anchor or host element found.'); // 💡 ADD THIS LOGGING
    sendResponse?.({ ok: false, reason: 'no_anchor' });
    return; // synchronous no-op is fine her
  }
  
  if (request.action === 'getSkillMatchState') {
    waitForDomStable({ timeoutMs: 2500, quietMs: 180 });
    const meta = { url: location.href, title: getJobTitleStrict(), company: getCompanyName(), location: getLocationText(), logoUrl: getCompanyLogoUrl() };
    //console.log('2. In contentscript.js getskillmatchstate percentage,matchedwords and allskills:',percentage,matchedWords,allSkills);
    sendResponse?.({ percentage: JA_STATE.percentage, matchedWords:JA_STATE.matchedWords, allSkills: JA_STATE.allSkills, meta, jobKey: JA_STATE.currentJobKey });
    return;// true;
  }

  if (request.action === 'getActiveLinkedInMeta') {
    const fresh = isLinkedInHost() ? (getLinkedInActiveCardMeta() || JA_STATE.lastActiveLIMeta) : null;
    sendResponse?.(fresh || null);
    return;// true;
  }
  if (request.action === 'getActiveCompanyMeta') {
    //const fresh = (!isLinkedInHost()) ? (getGenericActiveCardMeta() || lastActiveGenericMeta) : (getLinkedInActiveCardMeta() || lastActiveLIMeta) : null;
    // This structure correctly handles the ternary operator.
    const fresh = (!isLinkedInHost()) 
      ? (getGenericActiveCardMeta() || JA_STATE.lastActiveGenericMeta || null) 
      : (getLinkedInActiveCardMeta() || JA_STATE.lastActiveLIMeta || null);
    sendResponse?.(fresh || null);
    return;// true;
  }

  if (request.action === 'hasFillableForm') {
    sendResponse({ ok: !!document.querySelector('input,select,textarea') });
    return;// true;
  }
  if (request.action === 'showCanonicalChooser') {
    // placeholder; you can render an overlay later
    sendResponse?.({ ok: true });
    return;// true;
  }
});

/* =========================
   9) Submit-click → inject atswatchers.bundle.js on demand
   ========================= */
const SUBMIT_TEXT_RX = /\b(submit|submit application|send application|finish|confirm|complete application|final submit)\b/i;
const SUBMIT_SELECTORS = 'button, input[type="submit"], a, [role="button"]';

(function installSubmitClickWatcher() {
  if (window.__JA_submitWatcher__) return;
  window.__JA_submitWatcher__ = true;

  document.addEventListener('click', (e) => {
    // Walk up from the click target to find a matching submit element
    const el = e.target.closest(SUBMIT_SELECTORS);
    if (!el) return;

    const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
    if (!SUBMIT_TEXT_RX.test(text)) return;

    // Already injected? Skip.
    if (window.__JobAidATSWatchers__) return;

    // Ask background to programmatically inject atswatchers.bundle.js
    chrome.runtime.sendMessage({ action: 'injectATSWatchers' }).catch(() => {});
  }, { capture: true, passive: true });
})();

/***********************************************
 * contentscript.js — Autofill re-entry watcher
 * Injects autofill.bundle.js on refresh if a
 * pending resume upload was in progress.
 ***********************************************/
initAutofillReentry({
  pauseDetections,
  runDetection,
  // optional: if later you want to expand hosts
  // hosts: ["icims.com", "some-other-host.com"],
});

// Exports
export {
  __JA_FRAME_ID, __JA_LOCK_KEY, pauseDetections, shouldPauseDetections,
  refreshAutofillStateOnce, runDetection
};

