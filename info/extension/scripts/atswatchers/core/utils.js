/**
 * scripts/atswatchers/core/utils.js
 * Pure DOM helpers and URL utilities — no chrome.runtime dependency.
 */

/** Safe querySelector wrapper */
export const QS = (sel, root = document) => {
  try { return root.querySelector(sel); } catch { return null; }
};

/** Get trimmed attribute value from first match */
export const attr = (sel, a, root = document) =>
  (QS(sel, root)?.getAttribute?.(a) || "").trim();

/** Resolve a URL to absolute */
export const abs = (u) => {
  try { return new URL(u, location.href).href; } catch { return ""; }
};

/** Favicon absolute URL (fallback to /favicon.ico) */
export const favicon = () => {
  const href =
    attr('link[rel="icon"]', 'href') ||
    attr('link[rel="shortcut icon"]', 'href') ||
    attr('link[rel*="apple-touch-icon" i]', 'href') ||
    '/favicon.ico';
  return href ? abs(href) : "";
};

/**
 * Merge `patch` into `base`, skipping empty/null/undefined values.
 */
export const nonEmptyMerge = (base, patch) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
  }
  return out;
};

/**
 * Visibility check — on-screen and not hidden via CSS.
 */
export const isVisible = (el) => {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};