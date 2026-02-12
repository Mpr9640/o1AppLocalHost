/**
 * scripts/atswatchers/core/messaging.js
 * All chrome.runtime background messaging helpers.
 */

/** Send a message to the background script and resolve with the response. */
export function sendBg(payload) {
  return new Promise((resolve) => {
    try { chrome.runtime?.sendMessage(payload, (resp) => resolve(resp)); }
    catch { resolve(null); }
  });
}

/** Retrieve the current tab's job context from background. */
export async function getCtx() {
  const r = await sendBg({ action: 'getJobContext' });
  return r?.ctx || null;
}

/** Ask background to canonicalize a URL. */
export async function canonicalize(u) {
  const r = await sendBg({ action: 'canonicalizeUrl', url: u });
  return r?.canonical || '';
}

/** Fetch cached metadata for a canonical URL from the background store. */
export async function getMetadataFromCache(canonicalUrl) {
  if (!canonicalUrl) return null;
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getCanonicalMetadata',
      canonicalUrl
    });
    if (response && response.ok && response.data) return response.data;
  } catch (e) {
    console.error("Error retrieving canonical metadata:", e);
  }
  return null;
}