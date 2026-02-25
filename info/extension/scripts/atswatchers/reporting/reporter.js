/** hii
 * scripts/atswatchers/reporting/reporter.js
 * Main success-reporting flow: gather metadata, enforce idempotence,
 * notify background, and show the confirmation card.
 */

import { sendBg } from '../core/messaging.js';
import { nonEmptyMerge, favicon } from '../core/utils.js';
import { enrichWithStickyContext } from '../metadata/enricher.js';
import { oncePerJob } from './idempotence.js';
import { showSubmissionCard, showCanonicalChooserCard } from './submissionCard.js';

export async function reportSuccess() {
  try {
    const info = await enrichWithStickyContext();     //Current page job context.

    // 1) Get active journey snapshot (present tab first, then referrer fallback)
    let journeySnap = null;
    let startUrl = null;
    let applyUrl = null;

    try { //Present tabId journey
      const jRes = await sendBg({ action: 'getActiveCanonicalSnapshot' });
      if (jRes?.ok) {
        journeySnap = jRes.snapshot || null;
        startUrl = jRes.start_url || null;
        applyUrl = jRes.apply_url || null;
      }
    } catch (e) {
      console.log("Error getting present tab canonical snapshot:", e);
    }

    if (!journeySnap) {  //No present tabId journey, than look for referrer tabId journey
      try {
        const jRes = await sendBg({
          action: 'getActiveCanonicalSnapshot',
          referenceUrl: document.referrer || ''
        });
        if (jRes?.ok) {
          journeySnap = jRes.snapshot || null;
          startUrl =  jRes.start_url || null;
          applyUrl =  jRes.apply_url || null;
        }
      } catch (e) {
        console.log("Error getting referrer tab canonical snapshot:", e);
      }
    }

    // 2) Determine final canonical (prefer journey start_url)
    const finalCanon = (startUrl || '').trim();// || info?.canon   //final url is start url
    if (!finalCanon) return;

    // 3) once-per-job guard
    const firstTime = await oncePerJob(finalCanon);   
    if (!firstTime) return;

    // 4) Resolve meta (prefer journey snapshot)                //Fianl Meta from journey
    const title = journeySnap?.title || ''; //info.title || 
    const company = journeySnap?.company|| '' //|| info.company || '';
    const loc = journeySnap?.location|| '' // || info.location || '';
    const logo = journeySnap?.logoUrl|| ''  // || info.logo || favicon();

    // 5) Extra safety: already applied? bail
    try {                                                         //Checking wehter this url/meta is applied before
      const chk = await sendBg({
        action: 'checkAppliedForUrl',
        url: finalCanon,
        title,
        company,
        location: loc
      });
      if (chk?.ok && chk.applied_at) return;
    } catch {}

    const applied_at = new Date().toISOString();                //if applied update the date.
                                                           
    const basePayload = nonEmptyMerge(                         //Building a payload for appliedjob
      {
        action: 'appliedJob',
        url: finalCanon,
        applied_at,
        start_url: startUrl,
        apply_url: applyUrl
      },
      {
        title,
        company,
        location: loc,
        logo_url: logo,
        ats_vendor: location.hostname,
        preview_card: {
          title,
          subtitle: [company, loc].filter(Boolean).join(' • '),
          logo_url: logo,
          link_url: finalCanon
        }
      }
    );

                                                              //  First attempt: submissionDetected
    let subres = null;
    try {
      subres = await sendBg({
        action: 'submissionDetected',
        pageCanonical: finalCanon,
        referrer: startUrl || document.referrer || '',          //Treating referrer as start url/doc refer
        start_url: startUrl,
        apply_url: applyUrl
      });
    } catch {}

    // If submissionDetected succeeded and not waiting => show submitted ✓ card
    if (subres?.ok && !subres?.waitForUser) {
      showSubmissionCard(basePayload.preview_card);               //when background returns ok , than it is using pyaload build with the data from this page, not building the payload from the background to preview.
      return;                                                     //return
    }

                                                                    // 7) No submission ok / waiting => show chooser card and let user select manually
    const items = await getCanonicalItemsForChooser({ startUrl, applyUrl });
    if (!items.length) {                                              //No items, return
      // Nothing buffered; show submit card but don't auto-save
      //showSubmissionCard(basePayload.preview_card);
      return;
    }
    showCanonicalChooserCard(                                       //showing all items and saving user pick, calling markapplied, jo_applied actions
      items,
      async (it) => {
        const ok = await saveFromChooserPick(it, { title, company, location: loc, logoUrl: logo }, { startUrl, applyUrl });
        if (!ok) throw new Error("save failed");

        // delete only on success (safer UX)
        try { await sendBg({ action: "canonicalListDelete", url: it.url }); } catch {}               //Deleting the job from canonicla list

        // show success confirmation
        showSubmissionCard({                                                                         //Showing submission card for canonicalchoose
          title: it.title || title || '—',
          subtitle: [it.company || company, it.location || loc].filter(Boolean).join(' • '),
          logo_url: it.logo_url || logo || null
        });
      },
      {
        title: 'Pick the job you just applied',
        subtitle: 'We couldn’t confirm automatically. Select one to save it as applied.'               // Heading with context in canonical
      }
    );

  } catch {
    // swallow
  }
}

/* ==================== Chooser data ==================== */

async function getCanonicalItemsForChooser({ startUrl, applyUrl }) {
  let items = [];
  try {
    const r = await sendBg({ action: "getCanonicalList" });
    if (Array.isArray(r?.items)) {
      items = r.items
        .filter(x => x?.url)
        .slice(0, 7)
        .map(x => ({
          url: x.url,
          title: x.title || "Unknown",
          company: x.company || "",
          location: x.location || "",
          logo_url: x.logo_url || x.logoUrl || null,
          ats_vendor: (x.url || "").includes("linkedin.com") ? "linkedin" : "extension",
          applied_at: x.submitted_at || null,
          start_url: startUrl || null,
          apply_url: applyUrl || null
        }));
    }
  } catch {}
  return items;
}

/* ==================== Save flow (popup-equivalent) ==================== */

async function saveFromChooserPick(it, fallbackMeta, { startUrl, applyUrl }) {
  // 1) manualPickCanonical first
  try {
    const r = await sendBg({ action: "manualPickCanonical", url: it.url });
    if (r?.ok) return true;
  } catch {}

  // 2) appliedJob -> fallback markApplied
  const payload = {
    title: it.title || fallbackMeta?.title || "",
    company: it.company || fallbackMeta?.company || "",
    location: it.location || fallbackMeta?.location || "",
    url: it.url,
    logo_url: it.logo_url || fallbackMeta?.logoUrl || null,
    job_id: it.job_id || null,
    ats_vendor: it.ats_vendor || (String(it.url || "").includes("linkedin.com") ? "linkedin" : "extension"),
    applied_at: it.applied_at || new Date().toISOString(),
    start_url: it.start_url || startUrl || null,
    apply_url: it.apply_url || applyUrl || null,
    preview_card: {
      title: it.title || fallbackMeta?.title || "—",
      subtitle: [it.company || fallbackMeta?.company, it.location || fallbackMeta?.location]
        .filter(Boolean).join(" • "),
      logo_url: it.logo_url || fallbackMeta?.logoUrl || null,
      link_url: it.url
    }
  };

  try {
    let res = await sendBg({ action: "markApplied", ...payload }).catch(() => ({ ok: false }));
    /*if (!res?.ok) {
      res = await sendBg({ action: "appliedJob", ...payload }).catch(() => ({ ok: false }));
    } */
    return !!res?.ok;
  } catch {
    return false;
  }
}
