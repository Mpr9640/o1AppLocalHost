// backround.js — canonical URLs + instant applied cache + ML ranking + sticky job context
//ajid-application journey id
import apiClient from "../src/axios.js";
const API_BASE_URL = 'http://localhost:8000'; // or your prod base
import {
  extractSkillCandidates,
  getUserSkillsSet,
  fuzzyMatch,
  normalizeSkill,
  refreshTaxonomyIfStale,
  setRemoteTaxonomy,
} from './scripts/skillmatching.js';

const USE_REMOTE_TAXONOMY = false;
//const log = (...a) => DEBUG && console.log('[bg]', ...a);
const ATS_HOSTS_RX = /(greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|myworkdayjobs\.com|icims\.com|taleo\.net|oraclecloud\.com|smartrecruiters\.com|apply\.workable\.com|bamboohr\.com|successfactors\.com|adp\.com|app\.jazz\.co|applytojob\.com|ashbyhq\.com|jobs\.ashbyhq\.com)/i;
const PLATFORM_HOSTS_RX = /(linkedin\.com|indeed\.com|glassdoor\.com|monster\.com|dice\.com|ziprecruiter\.com|careerbuilder\.com|simplyhired\.com|jobvite\.com|idealist\.org|jobhire\.ai)/i;
const isATS = (u) => { try { return ATS_HOSTS_RX.test(new URL(u).hostname); } catch { return false; } };
const isPLATFORM = (u) => { try { return PLATFORM_HOSTS_RX.test(new URL(u).hostname); } catch { return false; } };
//const isPlatform = (u) => !isATS(u);
const isPlatform = (u) =>isPLATFORM(u);

//==ML models
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

let creatingOffscreen = null;
async function ensureOffscreen() {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    console.log('[bg] ensureOffscreen start', OFFSCREEN_URL);

    // Check existence
    if (chrome.runtime.getContexts) {
      const ctx = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [OFFSCREEN_URL],
      });
      console.log('[bg] getContexts count:', ctx.length);
      if (ctx.length) return;
    } else if (chrome.offscreen.hasDocument) {
      const exists = await chrome.offscreen.hasDocument().catch(()=>false);
      console.log('[bg] hasDocument:', exists);
      if (exists) return;
    }

    // Create
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Run ML pipelines off the service worker to reduce latency',
    });
    console.log('[bg] offscreen created');
  })();
  try { await creatingOffscreen; } finally { creatingOffscreen = null; }
}

async function waitForOffscreenReady(tries = 60, delay = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' });
      if (res?.ok&& res?.mlReady) return true;
    } catch {}
    await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

async function rebuildOffscreenIfStuck() {
  // close & recreate, then ping again
  try { await chrome.offscreen.closeDocument(); } catch {}
  await ensureOffscreen();
  return await waitForOffscreenReady(60, 100);
}

async function callOffscreen(action, payload) {
  try {
    await ensureOffscreen();
    let ready = await waitForOffscreenReady();
    if (!ready) {
      console.warn('[bg] offscreen not ready, rebuilding…');
      ready = await rebuildOffscreenIfStuck();
    }
    if (!ready) return { ok:false, error:'Offscreen not ready' };
    return await chrome.runtime.sendMessage({ action, payload });
  } catch (e) {
    return { ok:false, error:String(e?.message || e) };
  }
}

// (Remove local zero-shot/NER init — now proxied to offscreen)
let zeroShotDisabledUntil = 0;
let zeroShotTimeoutsInRow = 0;



function sanitizeTitle(t) {
  const s = (t||'').trim();
  if (!s) return s;
  if (/^thank\s+you\s+for\s+applying\.?$/i.test(s)) return ''; // treat as empty → fall back to ctx
  if (/^application\s+(submitted|received)\.?$/i.test(s)) return '';
  return s;
}

function noteZSTimeout(){
  zeroShotTimeoutsInRow += 1;
  if (zeroShotTimeoutsInRow >= 2) zeroShotDisabledUntil = Date.now() + 5*60*1000;
}
function noteZSSuccess(){ zeroShotTimeoutsInRow = 0; }

/* NER infra  */
//let nerPipePromise = null;
let nerDisabledUntil = 0;
let nerTimeoutsInRow = 0;
function noteNERTimeout(){ nerTimeoutsInRow+=1; if(nerTimeoutsInRow>=2) nerDisabledUntil=Date.now()+5*60*1000; }
function noteNERSuccess(){ nerTimeoutsInRow=0; }

/* Timeout helper */
const timeout = (p, ms) => new Promise((resolve, reject) => {
  let done = false;
  const to = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
  p.then(v => { if (done) return; clearTimeout(to); done = true; resolve(v); })
   .catch(e => { if (done) return; clearTimeout(to); done = true; reject(e); });
});

/* =================== Taxonomy refresh (optional) =================== */
async function maybeRefreshTaxonomy() {
  try {
    const stale = await refreshTaxonomyIfStale();
    if (!stale || !USE_REMOTE_TAXONOMY) return;
    try {
      const resp = await apiClient.get('/api/skills-taxonomy', { withCredentials: true });
      if (resp?.data && Array.isArray(resp.data?.skills)) {
        setRemoteTaxonomy(resp.data.skills, resp.data.synonyms || {});
        console.log('[bg] Applied remote taxonomy');
      }
    } catch {}
  } catch {}
}

/* =================== Canonicalization + instant "applied" cache =================== */

function safeHttpUrl(u) {
  if (!u || typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    if (x.protocol === 'http:' || x.protocol === 'https:') return x.href;
  } catch {}
  return null;
}
//rememberAppliedInstant,Write Data,Reads existing map, adds new job record, and writes the updated map back to storage.	return value(void (nothing))
async function rememberAppliedInstant(url, iso) { //remebering instant applied url with time
  try {
    const canon = canonicalJobUrl(url);
    if (!canon) return;
    const key = 'appliedInstantMap';
    const cur = await new Promise(res => chrome.storage.local.get(key, v => res(v[key] || {})));
    cur[canon] = iso || new Date().toISOString();
    await new Promise(res => chrome.storage.local.set({ [key]: cur }, () => res()));
  } catch {}
}
//getInstantApplied	Read Data,	Reads existing map from storage and checks if the job exists.	returns Timestamp or null
async function getInstantApplied(url) { //checking if job url  was previously marked as instant applied url
  try {
    const canon = canonicalJobUrl(url);
    const key = 'appliedInstantMap';
    const cur = await new Promise(res => chrome.storage.local.get(key, v => res(v[key] || {})));
    return canon ? cur[canon] || null : null;
  } catch { return null; }
}
// TCL → ISO map (local instant cache mirrored from saves)
const appliedTclMapKey = 'appliedTclMap';
async function getTclMap() {
  const r = await new Promise(res => chrome.storage.local.get(appliedTclMapKey, v => res(v[appliedTclMapKey] || {})));
  return r;
}
async function setTclMap(obj) {
  await new Promise(res => chrome.storage.local.set({ [appliedTclMapKey]: obj }, () => res()));
}
function tclKey({ title, company, location }) {
  const norm = (s) => String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim();
  return [norm(title), norm(company), norm(location)].filter(Boolean).join(' | ');
}
//saving title,company name and location into chrome storage with timestamp
async function rememberAppliedTcl(meta, iso) {
  const key = tclKey(meta);
  if (!key) return;
  const map = await getTclMap();
  map[key] = iso || new Date().toISOString();
  await setTclMap(map);
}


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
/* =================== Matching (unchanged core) =================== */
const PROPER_CASE = new Map([
  ['javascript','JavaScript'],['typescript','TypeScript'],['java','Java'],
  ['react','React'],['node.js','Node.js'],['nodejs','Node.js'],['node','Node.js'],
  ['postgres','PostgreSQL'],['postgresql','PostgreSQL'],
  ['github','GitHub'],['github actions','GitHub Actions'],
  ['docker','Docker'],['kubernetes','Kubernetes'],
  ['aws','AWS'],['amazon web services','AWS'],
  ['gcp','GCP'],['google cloud platform','GCP'],
  ['azure','Azure'],['microsoft azure','Azure'],
  ['ai','AI'],['artificial intelligence','AI'],
  ['ml','ML'],['machine learning','ML'],
  ['control systems','Control Systems'],
]);
// (… glue helpers unchanged …)
const LEADING_GLUE = /\b(?:experience|experienced|with|using|leverag(?:e|ing)|we|ideally|strong|solid|working|hands[- ]?on|proficiency|proficient|knowledge|understanding|ability|capability|exposure|familiar(?:ity)?|background|in|on|for|of|and|or|the|a|an)\b\s*/i;
const TRAILING_GLUE = /\s*\b(?:experience|preferred|plus|considered|also|etc|skills?|knowledge|background|exposure)\b\.?$/i;
function stripGlue(s){ let t=s.trim(); for(let i=0;i<4;i++){ const b=t; t=t.replace(LEADING_GLUE,'').replace(TRAILING_GLUE,'').trim(); if(t===b)break;} return t; }
function normalizeFreeText(s){ let t=(s||'').toLowerCase(); t=t.replace(/[–—]/g,'-').replace(/[“”]/g,'"').replace(/[’']/g,"'"); t=t.replace(/[^a-z0-9+#.\s]/g,' ').replace(/\s+/g,' ').trim(); t=t.replace(/\bto\s+\w.+$/i,'').trim(); return t; }
function normalizeCoreSkill(s){ const raw=stripGlue(normalizeFreeText(s)); if(!raw) return ''; const d=PROPER_CASE.get(raw); if(d) return d; if(raw.includes('amazon web services')) return 'AWS'; if(raw.includes('google cloud platform')) return 'GCP'; if(raw.includes('microsoft azure')) return 'Azure'; const pc=PROPER_CASE.get(raw.replace(/\./g,''))||PROPER_CASE.get(raw); if(pc) return pc; const words=raw.split(' ').filter(Boolean).map(w=>{ if(['aws','gcp','ai','ml','sql','nosql','nlp','ci','cd'].includes(w))return w.toUpperCase(); if(w==='github')return'GitHub'; if(w==='postgresql'||w==='postgres')return'PostgreSQL'; if(w==='javascript')return'JavaScript'; if(w==='typescript')return'TypeScript'; if(w==='react')return'React'; if(/^[a-z]/.test(w))return w[0].toUpperCase()+w.slice(1); return w; }); return words.join(' '); }
function dropGlueExpansions(canonArr){ const stop=new Set(['with','using','to','and','or','the','a','an','of','in','on','for','build','develop','design','leverage','we','ideally','experience','preferred','plus','also','considered']); const tokens=s=>s.toLowerCase().split(/\s+/).filter(Boolean); const keep=new Set(canonArr); const arr=Array.from(keep); for(let i=0;i<arr.length;i++){ for(let j=0;j<arr.length;j++){ if(i===j)continue; const a=arr[i],b=arr[j]; if(!a||!b)continue; const ta=tokens(a),tb=tokens(b); const idx=tb.join(' ').indexOf(ta.join(' ')); if(idx===-1)continue; const rest=tb.filter(w=>!ta.includes(w)); if(rest.length && rest.every(w=>stop.has(w))){ keep.delete(b);} } } return Array.from(keep); }
function postProcessSkills(raw){ const canon=raw.map(normalizeCoreSkill).filter(Boolean); const uniq=[]; const seen=new Set(); for(const s of canon){ const k=s.toLowerCase(); if(!seen.has(k)){ seen.add(k); uniq.push(s);} } const pruned=dropGlueExpansions(uniq); return pruned.slice(0,200); }

async function extractSkillsHybrid(jdText){
  await maybeRefreshTaxonomy();
  let skills=new Set(extractSkillCandidates(jdText));
  if(skills.size<8 || skills.size>200){
    try{
      const ner=await getNER();
      // smaller slice, similar recall, lower latency (2A)
      const run = timeout(ner(jdText.slice(0,4000), { aggregation_strategy: 'simple' }), 1200);
      const out=await run; noteNERSuccess();
      for(const ent of out||[]){ const w=normalizeSkill(ent.word||ent.entity||ent.entity_group||''); if(!w)continue; if(!/[a-z0-9+#.]/i.test(w))continue; skills.add(w); if(skills.size>=180)break; }
    }catch(e){ if(String(e?.message||e).includes('timeout')) noteNERTimeout(); }
  }
  return postProcessSkills(Array.from(skills));
}
function percent(m,t){ return t? (m/t)*100 : 0; }
function matchJDToUser(jobSkillsArr,userSkillsSet){ const matched=[]; for(const jd of jobSkillsArr){ for(const us of userSkillsSet){ if(fuzzyMatch(jd,us)){ matched.push(jd); break; } } } return Array.from(new Set(matched)); }

/* =================== Per-tab LI meta cache (unchanged) =================== */
const liActiveMetaByTab = new Map();

// ===== Journeys & Canonical Store (7-cap ring buffer) =====

const jobCtxByTab = new Map(); // tabId -> { canonical, first_canonical, meta, updated_at, confidence }
const journeysByTab = new Map(); // tabId -> { activeAjid, items: Map<ajid, Journey> }
const canonicalStore = [];       // most-recent-first
const MAX_CANONICALS = 7;

function newAjid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function norm(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
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

//For better iframes
// ---------- Primary-frame selector (works on any host) ----------
async function getAllFramesSafe(tabId) {
  try {
    // Requires "webNavigation" permission in the manifest.
    return await chrome.webNavigation.getAllFrames({ tabId });
  } catch {
    return null;
  }
}

// Pick the best frame to talk to (ATS > any non-top > top)
async function findPrimaryFrameId(tabId) {
  const frames = await getAllFramesSafe(tabId);
  if (!Array.isArray(frames) || frames.length === 0) return 0; // fall back to top

  // Prefer ATS/vendor frames
  const ats = frames.filter(f => ATS_HOSTS_RX.test((f.url || "")));
  if (ats.length) {
    // If multiple ATS frames, pick the deepest (usually the inner app)
    ats.sort((a, b) => (b.frameId - a.frameId) || (b.url.length - a.url.length));
    return ats[0].frameId;
  }

  // Next, any non-top iframe with an http(s) URL
  const nonTop = frames.filter(f => f.frameId !== 0 && /^https?:/.test(f.url || ""));
  if (nonTop.length) {
    nonTop.sort((a, b) => (b.frameId - a.frameId) || (b.url.length - a.url.length));
    return nonTop[0].frameId;
  }

  // Fallback: top frame
  return 0;
}

function sendToFrame(tabId, frameId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, resp => resolve(resp));
  });
}

// Generic proxy: forward a message to the primary frame of the active tab
async function proxyToPrimaryFrame(tabId, innerMessage, timeoutMs = 2000) {
  const frameId = await findPrimaryFrameId(tabId);
  console.log('[proxy] tab', tabId, '-> frame', frameId, innerMessage.action);
  let done = false;
  return await new Promise(async (resolve) => {
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok:false, error:'timeout' }); } }, timeoutMs);
    try {
      const resp = await sendToFrame(tabId, frameId, innerMessage);
      if (!done) { done = true; clearTimeout(t); resolve(resp || { ok:false }); }
    } catch (e) {
      if (!done) { done = true; clearTimeout(t); resolve({ ok:false, error:String(e?.message||e) }); }
    }
  });
}

const autofillActiveByTab = new Map();

/* =================== Listener =================== */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      function scoreMeta(m = {}) {
        let s = 0;
        if (m.title) s += 2;
        if (m.company) s += 2;
        if (m.location) s += 1;
        if (m.logoUrl || m.logo_url) s += 1;
        if (m.jobId) s += 1;
        return s;
      }
      //updating dict with new entries if not null
      function nonEmptyMerge(base, patch) {
        const out = { ...base };
        for (const [k, v] of Object.entries(patch || {})) {
          if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
        }
        return out;
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
      async function persistApplied({ title, company, location, url, logo_url, source = 'extension', applied_at }, sender) {
        const canonical = canonicalJobUrlCached(preferCtxCanonical(sender, url));
        const when = applied_at || new Date().toISOString();

        const body = {
          title: title || 'Unknown',
          company: company || '',
          location: location || '',
          url: canonical,
          status: 'applied',
          source,
          company_logo_url: logo_url || null,
          applied_at: when
        };

        const res = await apiClient.post('/api/jobs', body, { withCredentials: true });
        const savedAt = res?.data?.applied_at || when;

        await rememberAppliedInstant(canonical, savedAt);
        await rememberAppliedTcl(body, savedAt);
        removeCanonical(canonical);

        return { res, canonical, savedAt };
      }
      /*
      // Let popup route messages to the correct (ATS) frame.
      if (request.action === 'proxyToPrimaryFrame') {
        //const tabId = sender.tab?.id;
        const tabId = request.tabId || sender.tab?.id;
        if (!tabId) { sendResponse?.({ ok:false, error:'no tab' }); return; }

        // Forward the payload (e.g. { action:'openSkillsPanel' } or { action:'getSkillMatchState' })
        const inner = (request.payload && typeof request.payload === 'object')
         // ? request.payload:{};
          //: { action: request.targetAction || 'openSkillsPanel' };

        const resp = await proxyToPrimaryFrame(tabId, inner, request.timeoutMs || 2000);
        sendResponse?.(resp || { ok:false });
        return;
      }
      */
      if (request?.action === "setAutofillActive") {
        const tabId = sender?.tab?.id;
        if( tabId != null){
          autofillActiveByTab.set(tabId, !!request.active);
          sendResponse({ ok: true });
          return;
        }
      }
      if (request?.action === "getAutofillActive" ) {
        const tabId = sender?.tab?.id;
        if(tabId != null){
          sendResponse({ active: !!autofillActiveByTab.get(tabId) });
          return;
        }
      }
      if (request.action === 'canonicalizeUrl') {
        const canonical = canonicalJobUrl(request.url || sender?.url || '');
        sendResponse?.({ canonical });
        return;
      }
      if (request.action === 'JA_SHOW_ICON_TOP') {
        const tabId = sender?.tab?.id;
        if (!tabId) return;
        // Forward to top frame only
        chrome.tabs.sendMessage(tabId, { action: 'JA_RENDER_ICON_TOP', det: request.det }, { frameId: 0 })
          .catch(() => {});
      }

      if (request.action === 'JA_REMOVE_ICON_TOP') {
        const tabId = sender?.tab?.id;
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, { action: 'JA_REMOVE_ICON_TOP' }, { frameId: 0 })
          .catch(() => {});
      }
      // NEW: lock in first canonical seen when UI first appears
      if (request.action === 'noteFirstJobUrl') {
        const tabId = sender.tab?.id;
        const canon = canonicalJobUrl(request.url || sender?.url || '');
        if (tabId && canon) {
          const cur = jobCtxByTab.get(tabId) || { canonical: canon, first_canonical: canon, meta: {}, confidence: 0 };
          if (!cur.first_canonical) cur.first_canonical = canon;
          if (!cur.canonical) cur.canonical = canon;
          cur.updated_at = Date.now();
          jobCtxByTab.set(tabId, cur);
          sendResponse?.({ ok: true, first: cur.first_canonical });
        } else sendResponse?.({ ok: false });
        return;
      }

      if (request.action === 'updateJobContext') {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse?.({ ok:false, error: 'no tab' }); return; }
        const canonical = canonicalJobUrl(request.canonical || sender.url || request.url || '');
        const meta = request.meta || {};
        const confidence = typeof request.confidence === 'number' ? request.confidence : 0.8;
        const ctx = updateCtx(tabId, canonical, meta, confidence);
        sendResponse?.({ ok: true, ctx });
        return;
      }

      if (request.action === 'getJobContext') { //this listener is for getting id of a sender tab/if no id than we used active tabs and takes last focussed window tab id.
        const deliver = (tid) => {
          const ctx = jobCtxByTab.get(tid) || null;
          sendResponse?.({ ok: true, ctx });
        };
        if (sender.tab?.id) deliver(sender.tab.id);
        else chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => deliver(tabs?.[0]?.id));
        return true;
      }

      if (request.action === 'openPopup') {
        if (sender.tab?.id) {
          try {
            await new Promise((resolve) => chrome.tabs.sendMessage(sender.tab.id, { action: 'forceScanNow' }, () => resolve()));
            await new Promise(r => setTimeout(r, 150));
          } catch {}
        }
        chrome.action.openPopup();
        fetchDataFromBackend();
        sendResponse({ success: true, message: 'Popup opened.' });
        return;
      }

      if (request.action === 'liActiveJobCard') {
        if (sender.tab?.id) liActiveMetaByTab.set(sender.tab.id, request.meta || null);
        sendResponse?.({ ok: true });
        return;
      }
      /*
      if (request.action === 'getActiveJobMeta') {
        const deliver = (tid) => sendResponse?.(liActiveMetaByTab.get(tid) || null);
        if (sender.tab?.id) deliver(sender.tab.id);
        else chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => deliver(tabs?.[0]?.id));
        return true;
      }*/
      /*
      if (request.action === 'classifyJobPageAdvanced') {
        const sample = request?.sample || '';
        let mlBoost = 0;
        try {
          const r = await callOffscreen('offscreen.zs', { text: sample, labels: ['job_page','non_job_page'] });
          const score = Array.isArray(r?.data?.scores) ? (r.data.scores[0] || 0) : 0;
          mlBoost = Math.max(0, Math.min(0.8, score));
          noteZSSuccess();
        } catch { noteZSTimeout(); }
        sendResponse?.({ ok: true, mlBoost });
        return;
      }*/
      if (request.action === 'rankJDCandidates') {
        try {
          const items = Array.isArray(request.items) ? request.items.slice(0, 6) : [];
          if (!items.length) { sendResponse?.({ ok: true, bestIndex: 0 }); return; }

          // Run ZS for each candidate concurrently
          const outs = await Promise.all(
            items.map((t) =>
              callOffscreen('offscreen.zs', {
                text: t,
                labels: ['job_description', 'not_job_description'],
              })
            )
          );

          // IMPORTANT: pick the score of 'job_description' specifically
          let bestIndex = 0, bestScore = -1;
          outs.forEach((r, i) => {
            let s = 0;
            if (r?.ok && Array.isArray(r.data?.labels) && Array.isArray(r.data?.scores)) {
              const li = r.data.labels.findIndex((lbl) => lbl === 'job_description');
              s = (li >= 0) ? (Number(r.data.scores[li]) || 0) : 0;
            }
            if (s > bestScore) { bestScore = s; bestIndex = i; }
          });

          sendResponse?.({ ok: true, bestIndex });
        } catch (e) {
          sendResponse?.({ ok: false, error: String(e?.message || e) });
        }
      }

      // Semantic best-match for autofill
      if (request.action === 'bestMatch') {
        (async () => {
          const labels = Array.isArray(request.labels) ? request.labels : [];
          const answer = String(request.answer || '');
          const r = await callOffscreen('offscreen.bestMatch', { labels, answer });
          console.log('[bg] ML r value in background', r);
          sendResponse(r || { ok:false });
        })();
        return true; // <-- IMPORTANT
      }

      if (request.action === 'fetching cookie') {
        const response = await apiClient.post('/api/refresh', { withCredentials: true });
        sendResponse({ success: true, data: response.data });
        return;
      }

      
      if (request.action === 'jdText' && request.text) {
        console.log('the jd text:',request.text);
        const work = (async () => {
          const jdSkills = await extractSkillsHybrid(request.text);
          const userSkillSet = await getUserSkillsSet();
          const matchedWords = matchJDToUser(jdSkills, userSkillSet);
          const percentage = percent(matchedWords.length, jdSkills.length);
          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, { action:'displayPercentage', percentage, matchedWords, allSkills: jdSkills, jobKey: request.jobKey || null });
          }
          return true;
        })();
        try { await timeout(work, 2000); } catch {}
        sendResponse({ status: 'Job text processed.' });
        return;
      }
      if (request.action === 'journeyStart') {
        const tabId = sender.tab?.id;
        const snap = request?.snapshot || {};
        if (!tabId || !snap?.url) { sendResponse?.({ ok:false }); return; }

        const ajid = newAjid();
        upsertJourney(tabId, ajid, { snapshot: { ...snap }, active: true }); 
        const bag = getBag(tabId); if (bag) bag.activeAjid = ajid;

        pushCanonicalSnapshot(snap, ajid);

        sendResponse?.({ ok: true, ajid });
        return;
      }
      if (request.action === 'journeyBindCanonical') {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse?.({ ok:false }); return; }
        const bag = getBag(tabId);
        if (!bag?.activeAjid) { sendResponse?.({ ok:true, note:'no-active' }); return; }

        const ajid = bag.activeAjid;
        const canonical = canonicalJobUrl(request.canonical || sender.url || '');
        const score = Number(request.score || 0);

        const cur = upsertJourney(tabId, ajid, {});
        if (canonical) cur.seen.add(canonical);
        if (score >= 0.6 && (!cur.snapshot || !cur.snapshot.url)) {
          cur.snapshot = cur.snapshot || {};
          cur.snapshot.url = canonical;
        }
        bag.items.set(ajid, cur);

        sendResponse?.({ ok: true });
        return;
      }
      // New message handler in chrome.runtime.onMessage.addListener(request, sender, sendResponse)
      if (request.action === 'getCanonicalMetadata') {
        const requestedCanon = request.canonicalUrl;

        if (!requestedCanon) {
            sendResponse({ ok: false, error: 'No canonical URL provided.' });
            return;
        }
        // Check the global store for the snapshot (the 'total meat')
        const snapshot = getCanonicalSnapshot(requestedCanon);
        if (snapshot) {
          // Return the full snapshot metadata if found
          sendResponse({ 
            ok: true, 
            data: {
              title: snapshot.title,
              company: snapshot.company,
              location: snapshot.location,
              logoUrl: snapshot.logoUrl, // Or whichever properties you need
              // Include the ajid if needed for linking:
              ajid: snapshot.ajid 
            } 
          });
        } else {
          // Return success but no data if the canonical URL isn't in the store
          sendResponse({ ok: true, data: null });
        }
        return; //true; // Indicates an asynchronous response
      }

      if (request.action === 'submissionDetected') {
        const tabId = sender.tab?.id;
        // Canonicalize both the submission page and the referrer
        const pageCanon = canonicalJobUrl(request.pageCanonical || sender.url || '');
        const refCanon  = canonicalJobUrl(request.referrer || '');
        // Logic to select the preferred Canonical URL for primary tracking (Platform > ATS)
        //const preferCanon = (refCanon && isPlatform(refCanon)) ? refCanon : pageCanon;
        const preferCanon = (refCanon)? refCanon : pageCanon
        if (!tabId || !preferCanon) { sendResponse?.({ ok:false }); return; }
        // Retrieve the job journey bag based on the SENDER TAB ID (ATS tab)
        const bag = getBag(tabId);
        if (!bag || bag.items.size === 0) { sendResponse?.({ ok:false, error:'no-journey' }); return; }
        // 1. Try to bind to an existing journey in the CURRENT tab's bag
        let best = Array.from(bag.items.values()).find(j => j.status!=='submitted' && j.seen.has(preferCanon));
        if (!best && bag.activeAjid) best = bag.items.get(bag.activeAjid);
        if (!best) best = Array.from(bag.items.values()).filter(j=>j.status!=='submitted').sort((a,b)=>b.last_event_at-a.last_event_at)[0] || null;

        // --------------------------------------------------------------------------------
        // UPDATED LOGIC: Strict Snapshot Priority (Cache -> Current Journey)
        // --------------------------------------------------------------------------------

        let finalSnapshot = null;

        // PRIORITY 1: Check the global CACHE (canonicalStore) for the referrer's metadata
        if (refCanon /*&& isPlatform(refCanon)*/) {
            const cachedSnap = getCanonicalSnapshot(refCanon);
            if (cachedSnap) {
                finalSnapshot = cachedSnap;
                // If the current best journey exists, update its snapshot to the high-quality cached one.
                if (best && (!best.snapshot || cachedSnap.score > best.snapshot.score)) {
                  best.snapshot = finalSnapshot;
                  bag.items.set(best.ajid, best);
                }
    
            }
        }

        // PRIORITY 2: Fall back to the snapshot found in the current tab's active journey
        if (!finalSnapshot && best) {
          finalSnapshot = best.snapshot;
        }
        
        // --------------------------------------------------------------------------------
        // Final check for a usable snapshot (from either source)
        // --------------------------------------------------------------------------------

        if (!finalSnapshot || !finalSnapshot.url) {
          // Fallback to manual chooser if we couldn't derive metadata from the cache or journey
          try { chrome.tabs.sendMessage(sender.tab.id, { action: 'showCanonicalChooser' }); } catch {}
          sendResponse?.({ ok:true, waitForUser: true });
          return;
        }
        
        // Use the best available snapshot URL for the primary canonical ID
        //const primary = isPlatform(finalSnapshot.url) && preferCanon ? finalSnapshot.url : (preferCanon || finalSnapshot.url);
        const primary = finalSnapshot.url || preferCanon;
        const when = new Date().toISOString();

        // Mark the selected journey as submitted
        if (best) {
          best.status = 'submitted'; 
          best.submitted_at = when;
          bag.items.set(best.ajid, best);
        }
        
        // --------------------------------------------------------------------------------
        // Mark ALL Canonical URLs as Applied and Remove from Store
        // --------------------------------------------------------------------------------

        const urlsToMark = new Set([primary, refCanon, pageCanon].filter(Boolean));

        for (const url of urlsToMark) {
            markCanonicalSubmitted(url, when); 
            removeCanonical(url);
        }
        // Build the payload using the FINAL SNAPSHOT data
        const body = {
            title: norm(finalSnapshot.title) || 'Unknown',
            company: norm(finalSnapshot.company) || '',
            location: norm(finalSnapshot.location) || '',
            url: primary, // Always use the determined primary URL
            status: 'applied',
            source: 'extension',
            company_logo_url: finalSnapshot.logoUrl || null,
            applied_at: when,
        };
        try {
          const res = await apiClient.post('/api/jobs', body, { withCredentials: true });
          //await rememberAppliedInstant(primary, res?.data?.applied_at || when);
          await rememberAppliedInstant(refCanon, res?.data?.applied_at || when);
          await rememberAppliedInstant(pageCanon, res?.data?.applied_at || when);
          await rememberAppliedTcl(body, res?.data?.applied_at || when);

          // NEW: remove canonical from list immediately after successful send
          //removeCanonical(primary);

          /*if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, {
            action: 'appliedJobSaved', ok: true, data: res.data, title: body.title, company: body.company
          }); */
          sendResponse?.({ ok: true, data: res.data, ajid: best.ajid, canonical: primary });
        } catch (e) {
          const msg = e?.response?.data?.detail || e.message || 'save failed';
          /*if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { action: 'appliedJobSaved', ok: false, error: msg }); */
          sendResponse?.({ ok: false, error: msg }); 
        }
        return;
      }

      if (request.action === 'getActiveCanonicalSnapshot') {
        const tabId = sender.tab?.id;
        const bag = getBag(tabId);
        const j = bag?.activeAjid ? bag.items.get(bag.activeAjid) : null;
        sendResponse?.({ ok: true, snapshot: j?.snapshot || null, isActive: !!j });
        return;
      }
      if (request.action === 'getCanonicalList') {
        sendResponse?.({ ok: true, items: canonicalStore.slice(0, MAX_CANONICALS) });
        return;
      }
      if(request.action === 'canonicalListDelete'){
        const url = request.url || '';
        try {
          removeCanonical(url);
          sendResponse?.({ ok: true });   // respond success
        } catch (e) {
          sendResponse?.({ ok: false, error: String(e?.message || e) }); // respond error
        }
        return; // sync
        //removeCanonical(url);
      }
      // manualPickCanonical
      if (request.action === 'manualPickCanonical') {
        const url = request.url || '';
        if (!url) { sendResponse?.({ ok:false }); return; }
        const snap = canonicalStore.find(x => x.url === url);
        if (!snap) { sendResponse?.({ ok:false }); return; }

        try {
          const { res } = await persistApplied({
            title: norm(snap.title),
            company: norm(snap.company),
            location: norm(snap.location),
            url: snap.url,
            logo_url: snap.logo_url,
            source: 'extension',
            applied_at: new Date().toISOString()
          }, sender);
          sendResponse?.({ ok: true, data: res.data });
        } catch (e) {
          sendResponse?.({ ok:false, error: e?.response?.data?.detail || e.message || 'save failed' });
        }
        return;
      }
      // Apply & remember — ALWAYS key by first_canonical when available (2B)
      // appliedJob / markApplied
      if (request.type === 'JOB_AID__APPLIED' || request.action === 'appliedJob' || request.action === 'markApplied') {
        const p = request.payload || request;
        const payload = {
          title: sanitizeTitle(p.title),
          company: p.company,
          location: p.location,
          url: p.canon || p.source_url || p.url,
          logo_url: p.logo_url,
          source: p.ats_vendor || 'extension',
          applied_at: p.applied_at
        };

        try {
          const { res, savedAt, canonical } = await persistApplied(payload, sender);
          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, { action: 'appliedJobSaved', ok: true, data: res.data, title: payload.title || 'Unknown', company: payload.company || '' });
          }
          sendResponse({ ok: true, data: res.data, applied_at: savedAt, canonical });
          try {
            chrome.notifications?.create({ type: 'basic', iconUrl: 'images/icon.jpeg', title: 'Added into your applied job list', message: `${payload.title || 'Job'} · ${payload.company || ''}` });
          } catch {}
        } catch (e) {
          const msg = e?.response?.data?.detail || e.message || 'save failed';
          if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { action: 'appliedJobSaved', ok: false, error: msg });
          sendResponse({ ok: false, error: msg, applied_at: payload.applied_at || new Date().toISOString() });
        }
        return;
      }

      // Fast-path: remember applied instantly (used by ATS watchers toast path)
      if (request.action === 'rememberAppliedInstant') {
        try {
          // prefer the tab’s first_canonical if present
          const canonical = (typeof preferCtxCanonical === 'function')
            ? preferCtxCanonical(sender, request.url || '')
            : canonicalJobUrl(request.url || sender?.url || '');

          if (!canonical) { sendResponse?.({ ok: false, error: 'no canonical' }); return; }

          const applied_at = request.applied_at || new Date().toISOString();
          await rememberAppliedInstant(canonical, applied_at);
          sendResponse?.({ ok: true, canonical, applied_at });
        } catch (e) {
          sendResponse?.({ ok: false, error: String(e?.message || e) });
        }
        return;
      }
      // add near the top of the switch in the first listener
      if (request.action === 'fetchResume') {
        const file = await fetchResumeFile(request.fileUrl);
        if (file) {
          const reader = new FileReader();
          reader.onload = () => sendResponse({ success: true, fileData: reader.result, filename: file.name, type: file.type || "application/pdf" });
          reader.onerror = () => sendResponse({ success: false, error: 'Failed to read file' });
          reader.readAsDataURL(file);
        } else sendResponse({ success: false, error: 'Failed to fetch file' });
        return true;
      }
     /*
      if (request.action === 'fetchResume') {
        const { fileData, filename, type } = await fetchResumeFile(request.fileUrl);
        sendResponse?.({ success: true, fileData, filename, type });
        return;
      }*/
      if (request.type === 'SESSION_SET') {
        await sessionSet(request.payload || {});
        sendResponse?.({ ok: true });
        return;
      }
      if (request.type === 'SESSION_GET') {
        const data = await sessionGet(request.payload ?? null);
        sendResponse?.({ ok: true, data });
        return;
      }
      if (request.type === 'SESSION_REMOVE') {
        await sessionRemove(request.payload);
        sendResponse?.({ ok: true });
        return;
      }
      if (request.type === 'SESSION_CLEAR') {
        await sessionClear();
        sendResponse?.({ ok: true });
        return;
      }
      if (request.action === 'checkAppliedForUrl') {
        const reqCanon = canonicalJobUrlCached(preferCtxCanonical(sender, request.url || ''));
        try {
          // 0) TCL fast-path if provided
          const title = String(request.title || '').trim();
          const company = String(request.company || '').trim();
          const location = String(request.location || '').trim();
          if (title && company) {
            const map = await getTclMap();
            const iso = map[tclKey({ title, company, location })];
            if (iso) { sendResponse({ ok: true, applied_at: iso, canonical: reqCanon }); return; }
          }
          // 1) local instant (URL)
          const instant = await getInstantApplied(request.url ||  '');
          if (instant) { sendResponse({ ok: true, applied_at: instant, canonical: reqCanon }); return; }
          // 2) backend fallback
          const { data } = await apiClient.get('/api/jobs', { withCredentials: true });
          const canon = (u) => canonicalJobUrlCached(u || '') || '';
          const hit = (data || []).find(j => canon(j.url) === request.url) ||
                      (title && company ? (data || []).find(j =>
                        tclKey({title,company,location}) === tclKey({title: j.title, company: j.company, location: j.location})) : null);
          sendResponse({ ok: true, applied_at: hit?.applied_at || null, canonical: request.url });
        } catch (e) {
          sendResponse({ ok: false, error: e?.response?.data?.detail || e.message || 'lookup failed' });
        }
        return;
      }
      // 👇 NEW: Active-learning suggestions
      if (request.type === 'ACTIVE_LEARNING_SUGGEST') {
        try {
          const batch = request.batch || [];
          if (!batch.length) {
            sendResponse({ ok: true, suggestions: [] });
            return;
          }

          // Use your real backend path & client here
          // Option A: apiClient
          const { data } = await apiClient.post(
            '/active-learning/suggest',
            { questions: batch },
            { withCredentials: true },
          );
          // Expect shape: { suggestions: [...] }
          sendResponse({
            ok: true,
            suggestions: data?.suggestions || [],
          });
        } catch (e) {
          console.error('ACTIVE_LEARNING_SUGGEST failed', e);
          sendResponse({
            ok: false,
            error: e?.response?.data?.detail || e.message || 'active-learning suggest failed',
          });
        }
        return;
      }

      // 👇 NEW: Gemma suggestions
      if (request.type === 'GEMMA_SUGGEST') {
        try {
          const batch = request.batch || [];
          if (!batch.length) {
            sendResponse({ ok: true, items: [] });
            return;
          }

          // Option A: apiClient
          const { data } = await apiClient.post(
            '/gemma/suggest',
            { items: batch },
            { withCredentials: true },
          );

          // Expect shape: { items: [...] }
          sendResponse({
            ok: true,
            items: data?.items || [],
          });
        } catch (e) {
          console.error('GEMMA_SUGGEST failed', e);
          sendResponse({
            ok: false,
            error: e?.response?.data?.detail || e.message || 'gemma suggest failed',
          });
        }
        return;
      }

      // 👇 NEW: Active-learning feedback
      if (request.type === 'ACTIVE_LEARNING_FEEDBACK') {
        try {
          const feedback = request.feedback || [];
          const userId = request.userId || null;

          if (!feedback.length) {
            sendResponse({ ok: true });
            return;
          }

          await apiClient.post(
            '/active-learning/feedback',
            { feedback, user_id: userId },
            { withCredentials: true },
          );

          sendResponse({ ok: true });
        } catch (e) {
          console.error('ACTIVE_LEARNING_FEEDBACK failed', e);
          sendResponse({
            ok: false,
            error: e?.response?.data?.detail || e.message || 'active-learning feedback failed',
          });
        }
        return;
      }
    }
    catch (e) {
      console.error('Background listener error:', e);
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});     

/* =================== Backend & resume helpers =================== */
async function fetchDataFromBackend(){
  try{
    const response = await apiClient.get('api/candidate', { withCredentials: true });
    const data = response.data;
    console.log('data in background:', data);

    // --- simple helper ---
    const clean = s => (s ?? '').toString().trim();
    const buildLocation = (city, state) => {
      const c = clean(city);
      const s = clean(state);
      return [c, s].filter(Boolean).join(', ');
    };

    // Top-level residence
    data.residence_location = buildLocation(data.residence_city, data.residence_state);

    // Per-education location
    if (Array.isArray(data.educations)) {
      data.educations = data.educations.map(ed => ({
        ...ed,
        location: buildLocation(ed.city, ed.state),
      }));
    }

    // Per-experience location
    if (Array.isArray(data.experiences)) {
      data.experiences = data.experiences.map(ex => ({
        ...ex,
        location: buildLocation(ex.city, ex.state),
      }));
    }

    await chrome.storage.local.set({ autofillData: data });
    return data;
  } catch (e) {
    console.error("Error fetching candidate data:", e);
    return null;
  }
}

// --- helpers
async function blobToDataURL(blob) {
  const buf = await blob.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const mime = blob.type || 'application/octet-stream';
  return `data:${mime};base64,${b64}`;
}
function guessFilename(url, headers) {
  try {
    const cd = headers.get?.('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if (m) return decodeURIComponent(m[1] || m[2]);
  } catch {}
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop();
    if (last) return last;
  } catch {}
  return 'resume.pdf';
}
async function fetchResumeFile(fileUrl){
  try{
    const res=await fetch(fileUrl); if(!res.ok) return null;
    const blob=await res.blob(); const filename=fileUrl.split('/').pop()||'autofilled_file';
    return new File([blob], filename, { type: blob.type });
  }catch(e){ console.error('Error fetching resume file:',e); return null;}
} 
/*
async function fetchResumeFile(fileUrl) {
  // Accept absolute or API-relative
  let url = fileUrl || '';
  if (!/^https?:\/\//i.test(url)) url = `${API_BASE_URL}${url}`;
  const resp = await fetch(url, { credentials: 'omit' });
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
  const blob = await resp.blob();
  const fileData = await blobToDataURL(blob);
  const filename = guessFilename(url, resp.headers);
  return { fileData, filename, type: blob.type || 'application/pdf' };
}
*/
// --- session storage helpers (use chrome.storage.session; no-ops fallback just in case)
const hasSession = !!(chrome.storage && chrome.storage.session);
const memSession = new Map();

async function sessionSet(obj) {
  if (hasSession) return chrome.storage.session.set(obj);
  Object.entries(obj || {}).forEach(([k, v]) => memSession.set(k, v));
}
async function sessionGet(keyOrNull) {
  if (hasSession) {
    return chrome.storage.session.get(keyOrNull ?? null);
  }
  if (!keyOrNull) {
    const out = {};
    for (const [k, v] of memSession.entries()) out[k] = v;
    return out;
  }
  return { [keyOrNull]: memSession.get(keyOrNull) };
}
async function sessionRemove(keyOrKeys) {
  if (hasSession) return chrome.storage.session.remove(keyOrKeys);
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  keys.forEach(k => memSession.delete(k));
}
async function sessionClear() {
  if (hasSession) return chrome.storage.session.clear();
  memSession.clear();
}




/* =================== Housekeeping =================== */
chrome.tabs.onRemoved.addListener((tabId) => { liActiveMetaByTab.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'loading') liActiveMetaByTab.delete(tabId); });

setInterval(fetchDataFromBackend, 3 * 60 * 1000);
console.log('Background service worker initialized.');





