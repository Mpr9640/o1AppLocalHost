/**
 * scripts/atswatchers/reporting/reporter.js
 * Main success-reporting flow: gather metadata, enforce idempotence,
 * notify background, and show the confirmation card.
 */

import { sendBg } from '../core/messaging.js';
import { nonEmptyMerge, favicon } from '../core/utils.js';
import { enrichWithStickyContext } from '../metadata/enricher.js';
import { oncePerJob } from './idempotence.js';
import { showSubmissionCard } from './submissionCard.js';

/**
 * Gather metadata, enforce idempotence, notify background,
 * and show the user-facing confirmation card.
 */
export async function reportSuccess() {
  try {
    const info = await enrichWithStickyContext();
    const finalCanon = (info?.canon || '').trim();
    if (!finalCanon) return;

    // once-per-job guard (normalized canonical)
    const firstTime = await oncePerJob(finalCanon);
    if (!firstTime) return;

    // Background may already have this marked; bail if so (extra safety)
    try {
      const chk = await sendBg({
        action: 'checkAppliedForUrl',
        url: finalCanon,
        title: info.title,
        company: info.company,
        location: info.location
      });
      if (chk?.ok && chk.applied_at) return;
    } catch {}

    const applied_at = new Date().toISOString();
     console.log('In atswatchers going to report success.');
    // Let background bind source platform via referrer (e.g., LinkedIn -> ATS)
    const subres = await sendBg({
      action: 'submissionDetected',
      pageCanonical: finalCanon,
      referrer: document.referrer || ''
    });

    const payload = nonEmptyMerge({
      action: 'appliedJob',
      url: finalCanon,
      applied_at
    }, {
      title: info.title || '—',
      company: info.company || '',
      location: info.location || '',
      logo_url: info.logo || favicon(),
      ats_vendor: location.hostname,
      preview_card: {
        title: info.title || '—',
        subtitle: [info.company, info.location].filter(Boolean).join(' • '),
        logo_url: info.logo || favicon(),
        link_url: finalCanon
      }
    });

    // Persist via fallback if submissionDetected didn't succeed
    if (!subres?.ok) {
      console.log('ats watches step 1 unable to send so sending fallback with action appliedjob');
      await sendBg(payload);
    }

    showSubmissionCard(payload.preview_card);
  } catch {}
}