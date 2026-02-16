// backround.js — canonical URLs + instant applied cache + ML ranking + sticky job context
//ajid-application journey id
import apiClient from "../src/axios.js";
import {
  canonicalStore,
  MAX_CANONICALS,
  canonicalJobUrl,
  canonicalJobUrlCached,
  pushCanonicalSnapshot,
  markCanonicalSubmitted,
  removeCanonical,
  getCanonicalSnapshot
} from './background/canonandapplied/canon.js';
import {
  rememberAppliedInstant,
  getInstantApplied,
  getTclMap,
  tclKey,
  rememberAppliedTcl,
  persistApplied
} from './background/canonandapplied/appliedInstance.js';
import {
  jobCtxByTab,
  getBag,
  upsertJourney,
  updateCtx,
  preferCtxCanonical
} from './background/jobjourney/journeybyTab.js';
import {
  proxyToPrimaryFrame
} from './background/frames/iframeHandling.js';
import {
  norm,
  sanitizeTitle,
  timeout,
  isPlatform
} from './background/core/utils.js';
import {
  callOffscreen,
  noteZSTimeout,
  noteZSSuccess,
  noteNERTimeout,
  noteNERSuccess
} from './background/offscreen/offscreenMain.js';
import { extractSkillsHybrid } from './background/taxonomy/skillsExtraction.js';
import {processJDViaBackendWithFallback} from './background/taxonomy/skillsApi.js';


import {
  extractSkillCandidates,
  getUserSkillsSet,
  fuzzyMatch,
  normalizeSkill,
  refreshTaxonomyIfStale,
  setRemoteTaxonomy,
} from './scripts/skillmatching.js';




const API_BASE_URL =process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'; // or your prod base
function newAjid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
/* =================== Per-tab LI meta cache (unchanged) =================== */
const liActiveMetaByTab = new Map();
const autofillActiveByTab = new Map();

/* =================== Listener =================== */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
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
      // Programmatically inject atswatchers when content script detects submit click
      if (request.action === 'injectATSWatchers') {
        const tabId = sender?.tab?.id;
        if (!tabId) { sendResponse?.({ ok: false, error: 'no tab' }); return; }
        try {
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['atswatchers.bundle.js'],
          });
          sendResponse?.({ ok: true });
        } catch (e) {
          console.warn('[bg] injectATSWatchers failed:', e);
          sendResponse?.({ ok: false, error: String(e?.message || e) });
        }
        return;
      }

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
      // pseudo: wherever you forward show icon
      if (request.action === "JA_REFRESH_APPLIED_TOP") {
        chrome.tabs.sendMessage(sender.tab.id, request); // or target frame 0 if you do frame routing
      }
      // NEW: lock in first canonical seen when UI first appears
      if (request.action === 'noteFirstJobUrl') {
        const tabId = sender.tab?.id;
        const canon = canonicalJobUrl(request.url || sender?.url || '');
        if (tabId && canon) {
          const cur = jobCtxByTab.get(tabId) || { canonical: canon, first_canonical: canon, meta: {}, confidence: 0 };
          //if (!cur.first_canonical) 
          cur.first_canonical = canon;
          if (!cur.canonical) cur.canonical = canon;
          cur.updated_at = Date.now();
          jobCtxByTab.set(tabId, cur);
          console.log('final job context after notingdown first canonical in background listener:',jobCtxByTab);
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
        console.log('I received for updating job meta in jobcontext by tab map:',meta);
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
          //console.log('[bg] ML r value in background', r);
          sendResponse(r || { ok:false });
        })();
        return true; // <-- IMPORTANT
      }

      if (request.action === 'fetching cookie') {
        const response = await apiClient.post('/api/refresh', { withCredentials: true });
        sendResponse({ success: true, data: response.data });
        return;
      }
      if (request.action === "jdText" && request.text) {
        (async () => {
          try {
            const result = await processJDViaBackendWithFallback(request.text, request, sender);
            // send to content script (same as now)
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "displayPercentage",
                percentage: result.percentage,
                matchedWords: result.matchedWords,
                allSkills: result.allSkills,
                jobKey: request.jobKey || null
              });
            }

            sendResponse({ status: "Job text processed." });
            //return true;
          } catch (err) {
            console.warn("[jdText] failed:", err);
            sendResponse({ status: "error", error: String(err?.message || err) });
          }
        })();
        //return;
        return true; // keep sendResponse alive (async)
      }
      /*
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
      }*/
      if (request.action === "journeyStart") {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse?.({ ok: false }); return; }

        // 1) Prefer existing ctx stored by tabId
        const ctx = jobCtxByTab.get(tabId); // { canonical, first_canonical, meta, confidence, updated_at }
        const ctxUrl = ctx?.canonical || ctx?.first_canonical || "";

        // 2) Fallback: allow snapshot from content script
        const snapFromReq = request?.snapshot || null;

        // Build snapshot from background ctx if present
        const snapFromCtx = ctxUrl
          ? {
              url: ctxUrl,
              ...(ctx?.meta || {}),
              confidence: ctx?.confidence ?? 0,
              updated_at: ctx?.updated_at ?? Date.now(),
            }
          : null;

        const snap = snapFromCtx || snapFromReq;

        // If neither ctx nor request provided a usable url, ask for snapshot
        if (!snap?.url) {
          sendResponse?.({ ok: false, needSnapshot: true });
          return;
        }

        const ajid = newAjid();
        upsertJourney(tabId, ajid, { snapshot: { ...snap }, active: true });
        const bag = getBag(tabId);
        if (bag) bag.activeAjid = ajid;

        pushCanonicalSnapshot(snap, ajid);
        console.log('The data going to put in canonical store in background listneres:',snap,ajid);
        sendResponse?.({ ok: true, ajid, source: snapFromCtx ? "jobCtxByTab" : "request.snapshot" });
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
        console.log('The data sending to backedn when submission was happend:',body);
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
      /*
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
      */
      if (request.action === "checkAppliedForUrl") {
        const tabId = sender?.tab?.id;
        let reqCanon;
        if(request.case === "regular"){
          reqCanon = request.url;
        }
        if(!reqCanon){
          // Prefer canonical from ctx (or fallback to request.url)
          reqCanon = canonicalJobUrlCached(preferCtxCanonical(sender, request.url || ""));
        }
        // Pull TCL from request OR from jobCtxByTab meta
        const ctx = tabId != null ? jobCtxByTab.get(tabId) : null;
        const meta = ctx?.meta || {};

        const title = String(request.title || meta.title || "").trim();
        const company = String(request.company || meta.company || "").trim();
        const location = String(request.location || meta.location || "").trim();
        console.log('In checkapplied url the url and meta going to check:',reqCanon,meta);
        try {
          // 0) TCL fast-path (now works even if CS sends nothing)
          if (title && company) {
            const map = await getTclMap();
            const iso = map[tclKey({ title, company, location })];
            if (iso) {
              sendResponse({ ok: true, applied_at: iso, canonical: reqCanon, match: "tcl_map" });
              return;
            }
          }

          // 1) local instant (URL) - use canonical
          const instant = await getInstantApplied(reqCanon || "");
          if (instant) {
            sendResponse({ ok: true, applied_at: instant, canonical: reqCanon, match: "url_instant" });
            return;
          }

          // 2) backend fallback: match by canonical URL OR TCL
          const { data } = await apiClient.get("/api/jobs", { withCredentials: true });
          const canon = (u) => canonicalJobUrlCached(u || "") || "";

          const hitByUrl = (data || []).find(j => canon(j.url) === reqCanon);

          let hitByTcl = null;
          if (!hitByUrl && title && company) {
            const wanted = tclKey({ title, company, location });
            hitByTcl = (data || []).find(j =>
              tclKey({ title: j.title, company: j.company, location: j.location }) === wanted
            );
          }

          const hit = hitByUrl || hitByTcl;
          sendResponse({
            ok: true,
            applied_at: hit?.applied_at || null,
            canonical: reqCanon,
            match: hitByUrl ? "backend_url" : (hitByTcl ? "backend_tcl" : "none")
          });
        } catch (e) {
          sendResponse({ ok: false, error: e?.response?.data?.detail || e.message || "lookup failed" });
        }
        return true; // IMPORTANT for async sendResponse in MV3
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
console.log('In background jobCtxByTab:', jobCtxByTab);


export {
  newAjid,
  API_BASE_URL,
  liActiveMetaByTab,
  autofillActiveByTab,
  fetchDataFromBackend,
  blobToDataURL,
  guessFilename,
  fetchResumeFile,
  hasSession,
  memSession,
  sessionSet,
  sessionGet,
  sessionRemove,
  sessionClear,
  apiClient
};

//Problems: getner() is missing.