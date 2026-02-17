import { canonicalJobUrl } from '../canonandapplied/canon.js';
import { scoreMeta, nonEmptyMerge } from '../canonandapplied/utils.js';
//Journeys 
const jobCtxByTab = new Map(); // tabId -> { canonical, first_canonical, meta, updated_at, confidence }
const journeysByTab = new Map(); // tabId -> { activeAjid, items: Map<ajid, Journey> }
function getBag(tabId){ return journeysByTab.get(tabId) || null; }

//New start

// ✅ global store so AJID is shared across tabs
export const journeysByAjid = new Map(); // ajid -> Journey
// ✅ dedupe so same job doesn't start a new journey in a new tab
export const activeAjidByJobKey = new Map(); // jobKey -> ajid
export function normalizeUrl(u = "") {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}`; // strip query/hash
  } catch {
    return (u || "").trim();
  }
}

function norm(s = "") {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function jobKeyFromSnap(snap) {
  // Adjust keys to match your actual meta shape
  const title = norm(snap?.title || snap?.job_title || "");
  const company = norm(snap?.company || snap?.company_name || "");
  const location = norm(snap?.location || snap?.job_location || "");
  return `${title}||${company}||${location}`;
}

export function maybeSetApplyUrl(journey, url, score) {
  if (!url) return;
  if (Number(score || 0) < 0.6) return;

  const u = normalizeUrl(url);
  const s = normalizeUrl(journey.start_url || journey.snapshot?.url || "");

  if (!u || !s) return;
  if (u === s) return;
  if (!journey.apply_url) journey.apply_url = u; // set once
}

//New complete

//Function to get the entire tab journey of present tabID. if none found, create a new map with ajid as active
function upsertJourney(tabId, ajid, patch) {
  const bag = getBag(tabId) || { activeAjid: ajid, items: new Map() }; //getting bag based on tab
  const cur = bag.items.get(ajid) || { ajid, status: 'pending', started_at: Date.now(), seen: new Set(), last_event_at: Date.now(), snapshot: null, // ✅ NEW (URL lineage only)
    start_url: null,
    apply_url: null,
    jobKey: null
  }; //exploring bag with ajid
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
    //checking wether new url is same as before or not if not than creating a new record
    if (!prev || prev.canonical !== canon) {
        jobCtxByTab.set(tabId, {
        canonical: canon,
        first_canonical: canon ?? null, //|| prev?.first_canonical || null, //  we are keeping present url as main because in same tab multi job listing , if we use previous one may be lead to prevouse job url
        meta: { ...meta },
        updated_at: Date.now(),
        confidence
        });
        return jobCtxByTab.get(tabId);
    }
    const oldScore = scoreMeta(prev.meta);
    const newScore = scoreMeta(meta);
    const mergedMeta = nonEmptyMerge(prev.meta, meta); // we are updating previous meta with new ones if new meta is not undefined or null

    jobCtxByTab.set(tabId, {
        canonical: canon,
        //first_canonical:(newScore >= oldScore) ? canon :  prev.first_canonical || null,
        //prev.first_canonical ?? (canon ?? null),
        first_canonical:(newScore >= oldScore && canon !== undefined)? canon : (prev?.first_canonical !== undefined ? prev.first_canonical : null),
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
        return pick;
    } catch { return (reqUrl || sender?.url || ''); }
}
console.log('In journeybytab jbyTab:',journeysByTab);
export {
  jobCtxByTab,
  journeysByTab,
  getBag,
  upsertJourney,
  updateCtx,
  preferCtxCanonical
};