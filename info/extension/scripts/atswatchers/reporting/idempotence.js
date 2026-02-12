/**
 * scripts/atswatchers/reporting/idempotence.js
 * Ensures each job URL is only reported once per tab session.
 */

import { canonicalize } from '../core/messaging.js';

/**
 * Returns `true` the first time it is called for a given canonical URL
 * within the current tab session. Subsequent calls return `false`.
 */
export async function oncePerJob(finalCanon) {
  const norm = (await canonicalize(finalCanon)) || finalCanon.split('#')[0];
  const k = `__jobAid_applied__${norm}`;
  if (sessionStorage.getItem(k)) return false;
  sessionStorage.setItem(k, '1');
  return true;
}