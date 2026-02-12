// for checking visiblity 

const isVisible = (el) => {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const rect = el.getBoundingClientRect?.();
  if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
  if (!el.offsetParent && cs.position !== 'fixed') return false;
  return true;
};

// delaying the execution until DOM was stable
function waitForDomStable({ timeoutMs = 2500, quietMs = 180 } = {}) {
  return new Promise(resolve => {
    let timer = setTimeout(done, timeoutMs);
    let idle;
    const mo = new MutationObserver(() => {
      clearTimeout(idle);
      idle = setTimeout(done, quietMs);
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    function done(){
      mo.disconnect();
      clearTimeout(timer);
      resolve();
    }
  });
}


const clamp = (v,min,max)=>Math.max(min,Math.min(v,max));
const txt = (el) => (el?.innerText || el?.textContent || '').trim();
const sanitize = (s) => String(s || '').replace(/\s{2,}/g,' ').trim();
// Safe URL helpers
function safeURL(str, base = location?.href || "") {
  try {
    if (!str) return null;
    // If caller passes a fully qualified URL, use it; otherwise use base.
    return base ? new URL(str, base) : new URL(str);
  } catch {
    return null;
  }
}
const absUrl = (u) => { try {/* return u ? new URL(u, location.href).href : '';*/ const out = safeURL(u, location?.href || ""); return out ? out.href : ""; } catch { return ''; } };
const hash = (s) => { let h=0; for (let i=0;i<s.length;i++) h=Math.imul(31,h)+s.charCodeAt(i)|0; return String(h); };
const debounce = (fn, wait=400) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

// pick the element closest to the viewport center (used by getGenericActiveCardMeta)
function closestToViewportCenter(nodes) {
  let best = null, bestD = Infinity;
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (const n of nodes || []) {
    if (!n || !isVisible(n)) continue;
    const r = n.getBoundingClientRect();
    const x = Math.max(r.left, Math.min(cx, r.right));
    const y = Math.max(r.top, Math.min(cy, r.bottom));
    const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}
// BG messaging with timeout (popup-compatible pattern)
function sendBg(payload, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok:false, error:'timeout' }); } }, timeoutMs);
    try {
      chrome.runtime.sendMessage(payload, (resp) => {
        if (done) return;
        done = true; clearTimeout(t);
        if (chrome.runtime.lastError) return resolve({ ok:false, error: chrome.runtime.lastError.message });
        resolve(resp);
      });
    } catch (e) {
      if (done) return;
      done = true; clearTimeout(t);
      resolve({ ok:false, error: String(e?.message || e) });
    }
  });
}

// Exports
export {
  isVisible, waitForDomStable, clamp, txt, sanitize, safeURL, absUrl, hash, debounce,
  closestToViewportCenter, sendBg,
};
