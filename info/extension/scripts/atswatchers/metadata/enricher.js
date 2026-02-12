/**
 * scripts/atswatchers/metadata/enricher.js
 * Retrieves and enriches job metadata from background context,
 * canonical cache, and the current page DOM.
 */

import { favicon } from '../core/utils.js';
import { getCtx, canonicalize, getMetadataFromCache } from '../core/messaging.js';
import { sanitizeTitle } from './sanitizer.js';

/**
 * Build a merged metadata object from background context, cache,
 * and the current page.
 *
 * @returns {Promise<{ title: string, company: string, location: string, logo: string, canon: string }}
 */
export async function enrichWithStickyContext() {
  const [ctx, bgCanon] = await Promise.all([
    getCtx(),
    canonicalize(location.href)
  ]);

  const ctxCanon = ctx?.first_canonical || ctx?.canonical || '';
  const cacheMeta = await getMetadataFromCache(ctxCanon);
  const fromCtx = cacheMeta || ctx?.meta || {};

  const merged = {
    title: sanitizeTitle(fromCtx.title || document.title || ''),
    company: fromCtx.company || '',
    location: fromCtx.location || '',
    logo: fromCtx.logoUrl || favicon()
  };

  const finalCanon = ctxCanon || bgCanon || location.href;
  return { ...merged, canon: finalCanon };
}