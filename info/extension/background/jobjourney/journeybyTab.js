import { canonicalJobUrl } from '../canonandapplied/canon.js';
import { scoreMeta, nonEmptyMerge } from '../canonandapplied/utils.js';
//Journeys 
 const jobCtxByTab = new Map(); // tabId -> { canonical, first_canonical, meta, updated_at, confidence }
const journeysByTab = new Map(); // tabId -> { activeAjid, items: Map<ajid, Journey> }
function getBag(tabId){ return journeysByTab.get(tabId) || null; }
//Function to get the entire tab journey of present tabID. if none found, create a new map with ajid as active
function upsertJourney(tabId, ajid, patch) {
  const bag = journeysByTab.get(tabId) || { activeAjid: ajid, items: new Map() }; //getting bag based on tab
  const cur = bag.items.get(ajid) || { ajid, status: 'pending', started_at: Date.now(), seen: new Set(), last_event_at: Date.now(), snapshot: null }; //exploring bag with ajid
  const next = { ...cur, ...patch, last_event_at: Date.now() }; //merges existing journey data with new info. and records last event
  bag.items.set(ajid, next);
  if (!bag.activeAjid) bag.activeAjid = ajid;
  journeysByTab.set(tabId, bag);
  return next;
}
//Function to create a new info if not present for tabId
    function updateCtx(tabId, canonical, meta, confidence = 0.8) {
    const prev = jobCtxByTab.get(tabId);
    const canon = canonical || prev?.canonical || null;//1.

    if (!prev || prev.canonical !== canon) {
        jobCtxByTab.set(tabId, {
        canonical: canon,
        first_canonical: prev?.first_canonical || canon || null, // preserve first seen
        meta: { ...meta },
        updated_at: Date.now(),
        confidence
        });
        return jobCtxByTab.get(tabId);
    }
    const oldScore = scoreMeta(prev.meta);
    const newScore = scoreMeta(meta);
    const mergedMeta = nonEmptyMerge(prev.meta, meta); // never overwrite with blanks

    jobCtxByTab.set(tabId, {
        canonical: canon,
        first_canonical: prev.first_canonical || canon || null,
        meta: (newScore >= oldScore) ? mergedMeta : prev.meta,
        updated_at: Date.now(),
        confidence: Math.max(confidence, prev.confidence || 0)
    });
    return jobCtxByTab.get(tabId);
    }

    // Helper 2B: prefer first_canonical for applied & lookups
    function preferCtxCanonical(sender, reqUrl) {
    try {
        const tabId = sender?.tab?.id;
        const ctx = (tabId && jobCtxByTab.get(tabId)) || null;
        const pick =  ctx?.first_canonical || ctx?.canonical || reqUrl ||  sender?.url || '';
        return canonicalJobUrl(pick);
    } catch { return canonicalJobUrl(reqUrl || sender?.url || ''); }
    }

export {
  jobCtxByTab,
  journeysByTab,
  getBag,
  upsertJourney,
  updateCtx,
  preferCtxCanonical
};