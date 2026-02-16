import { sendBg } from "../../core/utils.js";
import { JA_STATE } from "../../core/state.js";
import { IS_TOP_WINDOW } from "../position.js";
let __JA_appliedPollId = null;
let __JA_appliedPollBusy = false;
// Minimal toast (used when clicking the green badge)
function showJobAppliedToast(appliedAt) {
  const txt = appliedAt ? `Applied before: ${new Date(appliedAt).toLocaleString()}` : 'Not applied yet';
  const id = "__jobAidToast__";
  let t = document.getElementById(id);
  if (!t) {
    t = document.createElement("div");
    t.id = id;
    Object.assign(t.style, {
      position: "fixed",
      left: "50%", transform: "translateX(-50%)",
      bottom: "16px",
      background: "#111827", color: "#fff",
      padding: "8px 12px",
      borderRadius: "10px",
      font: "14px system-ui",
      zIndex: 2147483648,
      boxShadow: "0 6px 22px rgba(0,0,0,.24)",
      opacity: "0",
      transition: "opacity .3s ease, transform .3s ease"
    });
    document.body.appendChild(t);
  }
  t.textContent = txt;
  t.style.opacity = "1";
  t.style.transform = "translateX(-50%) translateY(-20px)";
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(() => t.remove(), 400);
  }, 2500);
}

// ------- APPLIED BADGE (GREEN DOT) -------
let __JA_lastAppliedKey = ""; // NEW (instead of only canonical URL)
let __jobAidAppliedBadge =  null;
let __jobAidAppliedAt = null;
let __JA_lastAppliedCanonical = "";
window.__JobAidIconEl = window.__JobAidIconEl || null;

function ensureAppliedBadge() {
  if (__jobAidAppliedBadge) return __jobAidAppliedBadge;
  const b = document.createElement('div');
  b.id = '__jobAidAppliedBadge';
  Object.assign(b.style, {
    position: 'fixed',
    width: '12px', height: '12px', borderRadius: '50%',
    background: '#22c55e', border: '2px solid #ffffff',
    boxShadow: '0 0 0 1px rgba(0,0,0,.08), 0 2px 8px rgba(0,0,0,.25)',
    zIndex: '2147483648', cursor: 'pointer', pointerEvents: 'auto',
    display: 'none'
  });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (__jobAidAppliedAt) showJobAppliedToast(__jobAidAppliedAt);
  });
  document.body.appendChild(b);
  __jobAidAppliedBadge = b;
  return b;
}

function syncAppliedBadgePosition(iconEl) {
  if (!__jobAidAppliedBadge || !iconEl) return;
  const r = iconEl.getBoundingClientRect();
  const offsetX = -4; // top-right outside rim
  const offsetY = -4;
  __jobAidAppliedBadge.style.left = (r.left + r.width + offsetX) + 'px';
  __jobAidAppliedBadge.style.top  = (r.top  + offsetY) + 'px';
}

function setAppliedBadgeVisible(visible, appliedAt, iconEl) {
  const b = ensureAppliedBadge();
  if (visible) {
    __jobAidAppliedAt = appliedAt || null;
    b.title = appliedAt ? `Applied on ${new Date(appliedAt).toLocaleString()}` : 'Applied';
    b.style.display = 'block';
    syncAppliedBadgePosition(iconEl);
  } else {
    __jobAidAppliedAt = null;
    b.style.display = 'none';
  }
}
async function updateAppliedUI(iconEl) {
  console.log('1. updateapplied entered ');
  const icon = iconEl || window.__JobAidIconEl || document.getElementById("jobAidIcon");
  if (!icon) return;
  try {
   // const jobKey = opts.jobKey || ""; // NEW
    //const canonical = opts.canonical|| location.href  ;
    const canonical = location.href;
    //console.log('in updateappliedai the url sending to backgrounf for cheking',canonical);
    // For now, purely URL-based. No title/company/location (can add later).
    const resp = await sendBg({
      action: 'checkAppliedForUrl',
      url: canonical,
      case: 'regular'
      //jobKey // OPTIONAL: safe to include even if bg ignores for now
    });
    const appliedAt = resp?.applied_at || null;
    console.debug('2. updateapplied appliedstauts and url',appliedAt,canonical);
    setAppliedBadgeVisible(!!appliedAt, appliedAt, icon);
    //__JA_lastAppliedKey = jobKey || url; // NEW
    __JA_lastAppliedCanonical = canonical;
  } catch(error){
    console.debug('3. updateapplied error',error);
    setAppliedBadgeVisible(false, null, icon);
  }
}

async function maybeRefreshApplied(iconEl,opts={}) {
  console.log('1. maybe refresh entered ');
  const icon = iconEl || window.__JobAidIconEl||document.getElementById("jobAidIcon");
  if (!icon) return;
  const canonical = location.href;
  console.log('in applied checking that present url is same as last one',canonical === __JA_lastAppliedCanonical);

  if (canonical === __JA_lastAppliedCanonical) {
    console.debug('2. may be refresh break due to same url');
    return;
  }
  /*
  const url = opts.url || location.href;
  const jobKey = opts.jobKey || "";              // NEW
  const key = jobKey || url;                     // NEW
  if (key === __JA_lastAppliedKey) return;       // NEW
  await updateAppliedUI(icon, { url, jobKey });  // NEW */

  console.debug('3. may be refresh different ulr triggering update func',canonical);
  await updateAppliedUI(icon, { canonical });
}

function ensureAppliedPollStarted() {
  if (__JA_appliedPollId) return;
  __JA_appliedPollId = setInterval(async () => {
    try {
      if (__JA_appliedPollBusy) return;
      if (!window.__JobAidIconEl) return;               // icon not shown
      if (!JA_STATE?.jobApplicationDetected) return;    // not on job page UI

      __JA_appliedPollBusy = true;
      /*
      await maybeRefreshApplied(window.__JobAidIconEl, {
        jobKey: JA_STATE.currentJobKey,
        url: location.href
      }); */
      await maybeRefreshApplied();
    } finally {
      __JA_appliedPollBusy = false;
    }
  }, 4000); // 3–5 seconds (pick 4000ms)
}
function requestRefreshAppliedTop(payload) {
  if (IS_TOP_WINDOW) return false; // no need
  try {
    chrome.runtime.sendMessage({
      action: "JA_REFRESH_APPLIED_TOP",
      payload
    });
    return true;
  } catch {
    return false;
  }
}

// Exports
export {
  showJobAppliedToast, ensureAppliedBadge, syncAppliedBadgePosition, setAppliedBadgeVisible,
  updateAppliedUI, maybeRefreshApplied,ensureAppliedPollStarted,requestRefreshAppliedTop,
  __jobAidAppliedBadge, __jobAidAppliedAt, __JA_lastAppliedKey, __JA_lastAppliedCanonical
};