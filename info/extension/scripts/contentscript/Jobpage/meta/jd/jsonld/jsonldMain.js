import {
  flattenJsonLd,
  isJobPostingType,
  htmlToText,
} from "./jsonldHelpers.js";
// Main: find JobPosting nodes + optionally extract JD text
function findJobPostingsFromJSONLD({ extractText = true, requireVisibleSnippet = false } = {}) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  if (!scripts.length) return [];

  // Only compute once if you enable snippet check
  const pageText = requireVisibleSnippet ? (document.body?.innerText || '') : '';

  const results = [];

  for (const s of scripts) {
    const raw = s.textContent;
    if (!raw) continue;

    // Optional guard for extremely large JSON-LD blobs
    // (rare, but can happen on some sites)
    if (raw.length > 2_000_000) continue;

    let data;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }

    const nodes = flattenJsonLd(data);

    for (const node of nodes) {
      if (!isJobPostingType(node)) continue;

      let text = '';
      if (extractText) {
        const html =
          node.description ||
          node.responsibilities ||
          node.jobDescription || // occasional custom keys
          '';

        text = htmlToText(html);
      }

      if (requireVisibleSnippet && text) {
        const snippet = text.slice(0, 32);
        if (!snippet || !pageText.includes(snippet)) {
          // skip if you want to be strict that schema matches visible content
          continue;
        }
      }

      results.push({
        node,
        text,
        why: 'jsonld-jobposting',
        scriptEl: s
      });
    }
  }

  return results;
}
// JD collector compatible with your style
function collectJDFromJSONLD() {
  const found = findJobPostingsFromJSONLD({ extractText: true });
  // adapt to your existing output shape
  return found
    .filter(x => x.text)
    .map(x => ({ el: document.body, text: x.text, why: x.why }));
}
function readJSONLDJob() {
  try {
    const nodes = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s=>{
      try{
        const obj = JSON.parse(s.textContent||'');
        const arr = Array.isArray(obj)?obj:[obj];
        for (const n of arr) {
          const t = Array.isArray(n?.['@type']) ? n['@type'].join(',') : n?.['@type'];
          if ((t||'').toLowerCase().includes('jobposting')) nodes.push(n);
        }
      }catch{}
    });
    return nodes[0] || null;
  } catch { return null; }
}
// Simple boolean detector (short-circuits)
function jsonldHasJobPosting() {
  const found = findJobPostingsFromJSONLD({ extractText: false });
  return found.length > 0;
}

// Exports
export { findJobPostingsFromJSONLD, collectJDFromJSONLD, readJSONLDJob, jsonldHasJobPosting};
