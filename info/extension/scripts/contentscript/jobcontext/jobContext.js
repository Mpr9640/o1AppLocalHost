// core utils
import { debounce } from "../core/utils.js";

// job-page helpers
import { hasApplySignals } from "../Jobpage/findingHelpers.js";
import { getJobDescriptionText } from "../Jobpage/meta/jd/jdMain.js";

import { findJobTitleEl, getJobTitleStrict } from "../Jobpage/meta/jobtitle/jobTitle.js";
import { getCompanyName } from "../Jobpage/meta/jobcompany/jobCompanyMain.js";
import { getLocationText } from "../Jobpage/meta/joblocation/jobLocationMain.js";
import { getCompanyLogoUrl } from "../Jobpage/meta/jobicon/jobIconMain.js";



// extension/content/journey/applyClickMonitor.js

/**
 * Initializes Apply/Interested click monitor.
 * Keeps same behavior as inline IIFE:
 * - capture:true so it fires before SPA handlers/navigation
 * - passive:true (we don't call preventDefault)
 *
 * Dependencies are injected to avoid circular imports and keep this reusable.
 */
function initApplyClickMonitor(deps) {
  const {
    hasTitleCompanyLocation,
    getJobDescriptionText,
    canonicalScore,
    getJobTitleStrict,
    getCompanyName,
    getLocationText,
    getCompanyLogoUrl,
    sendJourneyStart,
    noteFirstJobUrl,
    getUrl = () => location.href,
    getClickLabel = (el) => (el.textContent || el.value || "").trim(),
    APPLY_RX = /(apply|i['’]?\s*m\s+interested|begin application|start application)/i,
  } = deps || {};

  if (!hasTitleCompanyLocation || !getJobDescriptionText || !canonicalScore) {
    throw new Error("initApplyClickMonitor: missing required deps");
  }

  const handler = async (e) => {
    const el = e.target?.closest?.("a,button,input[type=submit]");
    if (!el) return;

    const label = getClickLabel(el);
    if (!APPLY_RX.test(label)) return;

    try {
      const hasApply = true;
      const hasTCL = !!hasTitleCompanyLocation();
      const { text: jdText } = (await getJobDescriptionText()) || {};
      const hasJD = !!(jdText && jdText.length > 120);
      const score = canonicalScore({ hasApply, hasTCL, hasJD });

      const snapshot = {
        title: getJobTitleStrict?.() || "",
        company: getCompanyName?.() || "",
        location: getLocationText?.() || "",
        logoUrl: getCompanyLogoUrl?.() || "",
        url: getUrl(),
        score,
      };

      // Keep messaging exactly like before, but through injected funcs.
      try { await sendJourneyStart?.(snapshot); } catch {}
      try { await noteFirstJobUrl?.(getUrl()); } catch {}
    } catch {}
  };

  document.addEventListener("click", handler, { capture: true, passive: true });

  // Optional: return a cleanup function (useful for debugging / hot reload)
  return () => document.removeEventListener("click", handler, { capture: true });
}

// ---- Canonical scoring (40/30/30) ----
function canonicalScore({ hasApply, hasTCL, hasJD }) {
  const w = { apply: 0.4, tcl: 0.3, jd: 0.3 };
  let s = 0;
  if (hasApply) s += w.apply;
  if (hasTCL) s += w.tcl;
  if (hasJD) s += w.jd;
  return s;
}
function hasTitleCompanyLocation() {
  const t = (findJobTitleEl()?.textContent || '').trim();
  const c = (getCompanyName() || '').trim();
  const l = (getLocationText() || '').trim();
  return !!(t && c && l);
}
const bindPageToJourney = debounce(async () => {
  try {
    const hasApply = hasApplySignals();
    const hasTCL = hasTitleCompanyLocation();
    const { text: jdText } = await getJobDescriptionText();
    const score = canonicalScore({ hasApply, hasTCL, hasJD: !!(jdText && jdText.length > 120) });
    chrome.runtime.sendMessage({ action: 'journeyBindCanonical', canonical: location.href, host: location.hostname, score });
  } catch {}
}, 250);
//The bindPageToJourney function is triggered by three different event listeners
window.addEventListener('load', bindPageToJourney, { once: true }); // when full page loads
window.addEventListener('popstate', bindPageToJourney, { passive: true }); // chrome forward and back arrows
window.addEventListener('hashchange', bindPageToJourney, { passive: true }); // In url, when the text after # is changed.


async function pushJobContext(meta, { confidence = 0.8 } = {}) {
  try {
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'canonicalizeUrl', url: location.href }, resolve);
    });
    const canonical = resp?.canonical || location.href;
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'updateJobContext', canonical, meta, confidence }, resolve);
    });
  } catch {}
}

// Exports
export { initApplyClickMonitor, canonicalScore, hasTitleCompanyLocation, bindPageToJourney, pushJobContext };
