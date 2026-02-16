/**
 * scripts/atswatchers/detection/detector.js
 * Determines whether the current page looks like an
 * "application submitted" / success confirmation page.
 */

import { QS, isVisible } from '../core/utils.js';
import { getCtx } from '../core/messaging.js';
import {
  SUCCESS_SCORE_THRESHOLD,
  URL_SUCCESS_RX,
  TEXT_SUCCESS_RX,
  EMAIL_VERIFY_RX,
  AUTH_RX,
  AUTH_SELECTORS,
  SUCCESS_SELECTORS
} from './signals.js';

/**
 * Score the current page against weighted success signals.
 * Returns `true` when the combined score exceeds the threshold.
 */
export async function looksLikeSuccessPage() {
  const ctx = await getCtx();
  console.log('In ats watchers the context received:',ctx);
  const activeCanonUrl = ctx?.first_canonical || ctx?.canonical || '';
  const href = location.href;
  const title = document.title || '';
  const bodyText = (document.body?.innerText || '').slice(0, 4000);

  // 1) Guard against auth/login pages
  if (AUTH_RX.test(href) || AUTH_RX.test(title)) return false;
  if (AUTH_SELECTORS.some(sel => QS(sel))) return false;

  // Avoid "verify your email" interstitials unless there are strong success cues
  if (EMAIL_VERIFY_RX.test(bodyText) && !TEXT_SUCCESS_RX.test(bodyText)) return false;

  // 2) Evaluate weighted signals (bias to having a known canonical context)
  const urlHit = URL_SUCCESS_RX.test(href) ? 1 : 0;
  const textHit = TEXT_SUCCESS_RX.test(bodyText) ? 1 : 0;
  const canonHit = activeCanonUrl && activeCanonUrl.length > 10 ? 1 : 0;
  const selectorHit = SUCCESS_SELECTORS.some(sel => {
    const el = QS(sel);
    return el && isVisible(el) && /\b(thank|confirm|appl[y|ication]|submit)\b/i.test((el.innerText || '').trim());
  }) ? 1 : 0;

  const score =
    (0.3 * urlHit) +
    (0.3 * textHit) +
    (0.6 * canonHit) +
    (0.3 * selectorHit);

  return Math.min(score, 1) > SUCCESS_SCORE_THRESHOLD;
}