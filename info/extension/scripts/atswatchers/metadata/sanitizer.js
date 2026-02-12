/**
 * scripts/atswatchers/metadata/sanitizer.js
 * Strips generic success/thank-you headings from job titles.
 */

/**
 * Returns an empty string if the title is just a generic
 * success / thank-you / submission heading; otherwise returns
 * the trimmed original.
 */
export function sanitizeTitle(t) {
  const s = (t || '').trim();
  if (!s) return s;
  if (/^thank\s*you\b/i.test(s)) return '';
  if (/application\s*(?:was\s*)?(submitted|received|complete)\b/i.test(s)) return '';
  if (/^submission\b/i.test(s)) return '';
  return s;
}