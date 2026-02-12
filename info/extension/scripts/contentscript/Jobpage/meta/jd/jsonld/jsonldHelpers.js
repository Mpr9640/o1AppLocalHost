//# JSON-LD JobPosting finder (robust + efficient) ----
function normalizeType(t) {
  if (!t) return '';
  if (Array.isArray(t)) return t.join(',').toLowerCase();
  return String(t).toLowerCase();
}

function isJobPostingType(node) {
  const t = normalizeType(node?.['@type']);
  // precise match: JobPosting (and sometimes "JobPosting,SomethingElse")
  return t.includes('jobposting');
}

// Pull candidate nodes out of common JSON-LD shapes
function flattenJsonLd(root) {
  const out = [];
  const stack = [root];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i--) stack.push(cur[i]);
      continue;
    }

    if (typeof cur === 'object') {
      out.push(cur);

      // Common pattern: { "@graph": [...] }
      if (Array.isArray(cur['@graph'])) stack.push(cur['@graph']);

      // Also push all object/array children (covers nesting)
      for (const k in cur) {
        const v = cur[k];
        if (v && (typeof v === 'object')) stack.push(v);
      }
    }
  }
  return out;
}

// Fast HTML -> text without creating lots of DOM nodes repeatedly
function htmlToText(html) {
  if (!html) return '';
  // If no tags, return as-is quickly
  if (!/[<>]/.test(html)) return String(html).trim();

  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return (tmp.innerText || tmp.textContent || '').trim();
}


// Exports
export { normalizeType, isJobPostingType, flattenJsonLd, htmlToText};