import { ATS_HOSTS_RX } from '../core/utils.js';


//For better iframes
// ---------- Primary-frame selector (works on any host) ----------
async function getAllFramesSafe(tabId) {
  try {
    // Requires "webNavigation" permission in the manifest.
    return await chrome.webNavigation.getAllFrames({ tabId });
  } catch {
    return null;
  }
}

// Pick the best frame to talk to (ATS > any non-top > top)
async function findPrimaryFrameId(tabId) {
  const frames = await getAllFramesSafe(tabId);
  if (!Array.isArray(frames) || frames.length === 0) return 0; // fall back to top

  // Prefer ATS/vendor frames
  const ats = frames.filter(f => ATS_HOSTS_RX.test((f.url || "")));
  if (ats.length) {
    // If multiple ATS frames, pick the deepest (usually the inner app)
    ats.sort((a, b) => (b.frameId - a.frameId) || (b.url.length - a.url.length));
    return ats[0].frameId;
  }

  // Next, any non-top iframe with an http(s) URL
  const nonTop = frames.filter(f => f.frameId !== 0 && /^https?:/.test(f.url || ""));
  if (nonTop.length) {
    nonTop.sort((a, b) => (b.frameId - a.frameId) || (b.url.length - a.url.length));
    return nonTop[0].frameId;
  }

  // Fallback: top frame
  return 0;
}

function sendToFrame(tabId, frameId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, resp => resolve(resp));
  });
}

// Generic proxy: forward a message to the primary frame of the active tab
async function proxyToPrimaryFrame(tabId, innerMessage, timeoutMs = 2000) {
  const frameId = await findPrimaryFrameId(tabId);
  console.log('[proxy] tab', tabId, '-> frame', frameId, innerMessage.action);
  let done = false;
  return await new Promise(async (resolve) => {
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok:false, error:'timeout' }); } }, timeoutMs);
    try {
      const resp = await sendToFrame(tabId, frameId, innerMessage);
      if (!done) { done = true; clearTimeout(t); resolve(resp || { ok:false }); }
    } catch (e) {
      if (!done) { done = true; clearTimeout(t); resolve({ ok:false, error:String(e?.message||e) }); }
    }
  });
}

export {
  getAllFramesSafe,
  findPrimaryFrameId,
  sendToFrame,
  proxyToPrimaryFrame
};
