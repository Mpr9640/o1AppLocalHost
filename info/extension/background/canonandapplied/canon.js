import {
  norm
} from '../core/utils.js';


/* =================== Canonicalization =================== */
// Canonical Store (7-cap ring buffer) =====
const canonicalStore = [];       // most-recent-first
const MAX_CANONICALS = 7;
/** Canonical URL builder (used as stable job key) — preserves meaningful ID params */
function canonicalJobUrl(u) {
  if (!u) return null;
  return u;
} 
// tiny LRU(Least recently used) cache for canonicalization(canonicaljoburl(url))
//saving recently cached canonical urls
const canonLRU = (() => {
  const cap = 256, m = new Map();
  return {
    get(k){ if(!m.has(k)) return null; const v=m.get(k); m.delete(k); m.set(k,v); return v; },//delectes if exist
    set(k,v){ if(m.has(k)) m.delete(k); m.set(k,v); if(m.size>cap) m.delete(m.keys().next().value); } //update with new time
  };
})();
function canonicalJobUrlCached(u) {
  if (!u) return null;
  const hit = canonLRU.get(u); if (hit) return hit; //checks , if no than do function canonicalization
  const out = canonicalJobUrl(u); if (out) canonLRU.set(u, out);
  return out;
}
//Function to capture the data with the id key
function pushCanonicalSnapshot(snap, ajid) {
  const idx = canonicalStore.findIndex(x => x.url === snap.url);
  const record = {
    url: snap.url,
    title: norm(snap.title) || 'Unknown',
    company: norm(snap.company) || '',
    location: norm(snap.location) || '',
    logo_url: snap.logoUrl || null,
    started_at: Date.now(),
    ajid: ajid || null,
    submitted_at: null
  };
  if (idx >= 0) canonicalStore.splice(idx, 1); //deleting the present idx(represents where to start), here 1 representing how many deleting
  canonicalStore.unshift(record);
  if (canonicalStore.length > MAX_CANONICALS) canonicalStore.pop();
  return record;
}

//Marking the sumbitted canonical url with time stamp
function markCanonicalSubmitted(url, whenISO) {
  const r = canonicalStore.find(x => x.url === url);
  if (r) r.submitted_at = whenISO || new Date().toISOString();
  return r || null;
}
//removing url from canonical list
function removeCanonical(url) {
  const idx = canonicalStore.findIndex(x => x.url === url);
  if (idx >= 0) canonicalStore.splice(idx, 1);
}

// Assumed Helper (Must be present in background.js to work with canonicalStore)
function getCanonicalSnapshot(canonicalUrl) {
    // This function searches the global canonicalStore (the array of snapshots)
    // for a stored snapshot that matches the given canonical URL.
    return canonicalStore.find(x => x.url === canonicalUrl) || null;
}

console.log('In canon.js the canonical info found:',canonicalStore);
export {
  canonicalStore,
  MAX_CANONICALS,
  canonicalJobUrl,
  canonLRU,
  canonicalJobUrlCached,
  pushCanonicalSnapshot,
  markCanonicalSubmitted,
  removeCanonical,
  getCanonicalSnapshot
};
