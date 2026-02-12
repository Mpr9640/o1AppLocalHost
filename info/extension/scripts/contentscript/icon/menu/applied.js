import { sendBg } from "../../core/utils.js";
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
async function updateAppliedUI(iconEl, opts = {}) {
  //console.log('1. updateapplied entered ');
  const icon = iconEl || window.__JobAidIconEl;
  if (!icon) return;
  try {
    const canonical = opts.canonical|| location.href  ;
    //console.log('in updateappliedai the url sending to backgrounf for cheking',canonical);
    // For now, purely URL-based. No title/company/location (can add later).
    const resp = await sendBg({
      action: 'checkAppliedForUrl',
      url: canonical
    });
    const appliedAt = resp?.applied_at || null;
    console.debug('2. updateapplied appliedstauts',appliedAt);
    setAppliedBadgeVisible(!!appliedAt, appliedAt, icon);
    __JA_lastAppliedCanonical = canonical;
  } catch {
    console.debug('3. updateapplied error');
    setAppliedBadgeVisible(false, null, icon);
  }
}

async function maybeRefreshApplied(iconEl) {
  //console.log('1. maybe refresh entered ');
  const icon = iconEl || window.__JobAidIconEl;
  if (!icon) return;
  const canonical = location.href;
  if (canonical === __JA_lastAppliedCanonical) {
    //console.debug('2. may be refresh break due to same url');
    return;
  }
  //console.debug('3. may be refresh different ulr triggering update func',canonical);
  await updateAppliedUI(icon, { canonical });
}

// Exports
export {
  showJobAppliedToast, ensureAppliedBadge, syncAppliedBadgePosition, setAppliedBadgeVisible,
  updateAppliedUI, maybeRefreshApplied,
  __jobAidAppliedBadge, __jobAidAppliedAt, __JA_lastAppliedCanonical
};