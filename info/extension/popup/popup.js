//NOTES: using manual pick canonical . applied job action if not than using mark applied action.
document.addEventListener("DOMContentLoaded", init);

const APP_HOME = "http://localhost:3000/home";
function hasMeta(meta){return !!(meta.title && meta.company );} //|| meta.location || meta.logoUrl
async function init() {
  const authEl = $("#authState");
  const appliedEl = $("#applied");
  const scoreEl = $("#score");
  const matchesRow = $("#matchesRow");
  const othersRow = $("#othersRow");
  const matchesEl = $("#matches");
  const othersEl = $("#others");

  const openAppBtn = $("#openApp");
  const viewSkillsBtn = $("#viewSkills");
  const autofillBtn = $("#autofillbutton");
  const markAppliedBtn = $("#markApplied");

  const jobCard = $("#jobCard");
  const jobLogo = $("#jobLogo");
  const jobTitle = $("#jobTitle");
  const jobCompany = $("#jobCompany");
  const jobLocation = $("#jobLocation");
  const jobLink = $("#jobLink");

  if (authEl) authEl.textContent = "Open App goes to homepage";

  const tab = await getActiveTab().catch(() => null);

  // Sticky ctx (source of truth)
  let ctx = null;                                                 //Job context for present tab
  try { const r = await sendBg({ action: "getJobContext", tabId: tab?.id }); ctx = r?.ctx || null; } catch {}
  const ctxMeta = ctx?.meta || {};
  const ctxFirstCanon = ctx?.first_canonical || "";
  const ctxCanon = ctx?.canonical || ctxFirstCanon || "";
  const ctxScore = ctx?.confidence ?? 0;
  console.log('1.In popup ctx received',ctxMeta,ctxFirstCanon,ctxCanon,ctxScore);
  let meta = { title: "", company: "", location: "", logoUrl: "", url: ctxFirstCanon || ctxCanon || (tab?.url || "") };
  console.log('The answer fro hasMeta(ctxMeta) is:',hasMeta(ctxMeta));
  if(hasMeta(ctxMeta)) meta = nonEmptyMerge(meta, ctxMeta);                   //Meta with current jobContext
  //console.log('3. IN popup after merge the meta',meta);
  let showCard = false;
  let isTrueCanonicalPage = false;
  // Fetch journey data from journeysByTab via background
  let presentJourneySnap = null;
  let referrerJourneySnap = null;
  let startUrl = null;
  let applyUrl = null;
  try {                                                                     //Journey for present tab
    const jRes = await sendBg({ action: 'getActiveCanonicalSnapshot', tabId: tab?.id });
    if (jRes?.ok) {
      presentJourneySnap = jRes.snapshot || null;
      startUrl = jRes.start_url || null;
      applyUrl = jRes.apply_url || null;
    }
  } catch(e) { console.log("Error getting present tab canonical snapshot:", e); }
  if (!presentJourneySnap) {                                                  //if no present tab Journey, than referrer tab journey
    try {
      const jRes = await sendBg({ action: 'getActiveCanonicalSnapshot', referenceUrl: document.referrer || '' });
      if (jRes?.ok) {
        referrerJourneySnap = jRes.snapshot || null;
        startUrl = startUrl || jRes.start_url || null;
        applyUrl = applyUrl || jRes.apply_url || null;
      }
    } catch(e) { console.log("Error getting referrer tab canonical snapshot:", e); }
  }
  try {
    // Treat ≥0.6 as "true canonical detail page" (TCL/JD and/or Apply visible)
    isTrueCanonicalPage = !!(ctxScore && typeof ctxScore === "number" && ctxScore >= 0.6);   //checking wether present page is true canonical or no
    console.log('5. in popup checking the present page is true canonical page or not', isTrueCanonicalPage);
    if (isTrueCanonicalPage) {                                                              //showing card, if canon,start,apply url exists.
      // Use jobctxByTab as meta (already merged from ctxMeta above)
      showCard = true;
    } else if (presentJourneySnap) {
      // Use present tabId journey snapshot as meta
      showCard = true;
      meta = nonEmptyMerge(meta, presentJourneySnap);        //updating meta with presentjourney
    } else if (referrerJourneySnap) {
      // Use referrer tabId journey snapshot as meta
      showCard = true;
      meta = nonEmptyMerge(meta, referrerJourneySnap);       // updating meta with referrer journey
    } else {
      // neither a true detail page nor a known journey → hide
      showCard = false;
    }
  } catch {
    showCard = false;
  }
  // Lookup applied (URL or TCL)
  let appliedText = "Not applied yet";
  let tabCanon = meta.url;
  if (tabCanon/*meta.url*/) {
    try {
      const canResp = await sendBg({ action: "canonicalizeUrl", url: tabCanon/*meta.url*/ });   //checking wether applied or not based on final meta.url
      const canonical = canResp?.canonical || tabCanon || meta.url;
      const res = await sendBg({
        action: "checkAppliedForUrl",
        url: canonical,
        title: meta.title || "",
        company: meta.company || "",
        location: meta.location || ""
      });
      if (res?.ok && res.applied_at) appliedText = `Applied before: ${new Date(res.applied_at).toLocaleString()}`;
    } catch {}
  }
  appliedEl.textContent = appliedText;
  console.log('9. IN popup after checking the url wether it is applied or not, and updating the popup text',appliedText);


  console.log('12. In popup final meta',meta);
  if (showCard && hasMeta(meta)) {                         //showing job card only if it has meta(com/title)/showcard is true
    console.log('13. In popup, came inside for diaplaying job card');
    jobTitle.textContent = meta.title || "";
    jobCompany.textContent = meta.company || "";
    jobLocation.textContent = meta.location || "";
    jobLink.href = meta.url || "";

    const dotEl = document.querySelector(".job-sub .dot");
    if (dotEl) dotEl.style.display = (meta.company && meta.location) ? "inline" : "none";
                                                                                           //Falling back to job platform icons
    const faviconFallback = (u) => { try { const x = new URL(u); return `${x.origin}/favicon.ico`; } catch { return ""; } };
    let logoSrc = meta.logoUrl || "";
    if (!logoSrc && meta.url && !/linkedin\.com|indeed\.com|dice\.com|glassdoor\.com/i.test(meta.url)) {
      logoSrc = faviconFallback(meta.url);
    }
    if (logoSrc) {
      jobLogo.src = logoSrc;
      jobLogo.style.display = "block";
      jobLogo.onerror = () => { jobLogo.style.display = "none"; };
    } 
    else jobLogo.style.display = "none";
    jobCard.hidden = false;
  } else {
    jobCard.hidden = true;
  }


  async function getSkillStateWithRetry(tabId) {                  //skills display
    let s = await sendTab(tabId, { action: "getSkillMatchState" });
    if (!s || !Array.isArray(s.allSkills) || s.allSkills.length === 0) {
      await new Promise(r => setTimeout(r, 200)); // tiny backoff
      s = await sendTab(tabId, { action: "getSkillMatchState" });
    }
    return s;
  }
  requestAnimationFrame(async () => {
    if (!tab?.id) return;
    //const state = await sendTab(tab.id, { action: "getSkillMatchState" });
    const state = await getSkillStateWithRetry(tab.id);
    const pct   = Number(state?.percentage || 0);
    const match = Array.isArray(state?.matchedWords) ? state.matchedWords : [];
    const all   = Array.isArray(state?.allSkills) ? state.allSkills : [];
    console.log('14.skillmatch reqauest in popup percentage,match and all',pct,match,all);
    if (all.length > 0) {
      scoreEl.hidden = false; matchesRow.hidden = false; othersRow.hidden = false;
      scoreEl.textContent = `Skill match: ${Math.round(pct)}%`;
      matchesEl.innerHTML = ""; othersEl.innerHTML = "";
      match.slice(0, 50).forEach(s => matchesEl.appendChild(pill(s, "match")));
      const mset = new Set(match.map(x => (x || "").toLowerCase()));
      all.filter(x => !mset.has((x || "").toLowerCase()))
        .slice(0, 50)
        .forEach(s => othersEl.appendChild(pill(s, "other")));
    } else {
      scoreEl.hidden = true; matchesRow.hidden = true; othersRow.hidden = true;
    }
  });

  // Buttons
  openAppBtn.addEventListener("click", async () => { await chrome.tabs.create({ url: APP_HOME }); window.close(); });          //open app
 // popup.js (FINAL ROBUST VERSION)
  viewSkillsBtn.addEventListener("click", async () => {                           //Viewskills
      if (!tab?.id) return; 
      
      try {
        // Await the response from the content script (This is the line that might throw an error/reject)
        const res = await sendTab(tab.id, { action: "openSkillsPanel" });
        // 1. SUCCESS PATH: The content script responded explicitly with success.
        if (res?.ok === true) {
          window.close();
          return; // Exit after successful close
        }
        // 2. EXPLICIT FAILURE PATH: The content script responded explicitly with failure (e.g., {ok: false, ...})
        // If we reach here, res?.ok is explicitly false, or res is null/undefined due to some earlier issue.
        //alert('NO JD FOUND');
          
      } 
      catch (error) {
        // 3. REJECTION/CONNECTION FAILURE PATH: The message port closed, the tab was gone, or the content script didn't reply properly.
        console.error("Messaging failed (Port closed or other error):", error);
      }
      
      // Crucially, if there was an error or explicit failure, we don't close the window here.
  });


  autofillBtn.addEventListener("click", () => runAutofill());      //Autofill run
  // Manual "Mark applied" with in-popup chooser
  markAppliedBtn.addEventListener("click", async () => {                    //Markappliedbutton
    //if (!allowUI) { alert("Open a job page first."); return; }
    setBusy(markAppliedBtn, true, "Preparing…");
    // Step 2: Try submissionDetected first (same flow as reportSuccess)
    if (startUrl || meta?.url) {
      const subCanon = startUrl || meta?.url || "";
      try {
        const subres = await sendBg({                                //submission detection
          action: 'submissionDetected',
          pageCanonical: subCanon,
          referrer: startUrl || document.referrer || '',
          start_url: startUrl,
          apply_url: applyUrl
        });
        if (subres?.ok) {
          const when = subres.data?.applied_at || new Date().toISOString();
          appliedEl.textContent = `Applied before: ${new Date(when).toLocaleString()}`;   //UPdating applied textcontent
          if (subres.waitForUser) {
            // Submission detected but waiting for user — update applied context and keep busy
            setBusy(markAppliedBtn, true, "Saving…");
            return;
          }
          showNotice("Added");
          setBusy(markAppliedBtn, false, "Mark applied");
          setTimeout(() => window.close(), 400);
          return;
        }
      } catch {}
    }

    // Step 3: submissionDetected failed → fall back to existing flow
    // Pull the current canonical list from bg (most-recent-first)
    let items = [];
    try {
      const r = await sendBg({ action: "getCanonicalList" });      //If not submission than canoniallist
      if (Array.isArray(r?.items)) {
        items = r.items.map(x => ({
          url: x.url,
          title: x.title || "Unknown",
          company: x.company || "",
          location: x.location || "",
          logo_url: x.logo_url || null,
          ats_vendor: (x.url || "").includes("linkedin.com") ? "linkedin" : "extension",
          applied_at: x.submitted_at || null,
          start_url: startUrl,
          apply_url: applyUrl
        }));
      }
    } catch {}
    if (items.length >= 1) {                          //if items are >=1 than show cards to choose after that markapplied aciton
      await openCanonicalChooser(items, appliedEl, markAppliedBtn, meta); // render chooser inside popup
      //showNotice('Added');
      setBusy(markAppliedBtn, false, "Mark applied");
      return;
    } /*
    if (items.length === 1) {                    //only one card, take that card as default.
      const item = items[0];
      const payload = {
        title: item.title || meta?.title || "",
        company: item.company || meta?.company || "",
        location: item.location || meta?.location || "",
        url: item.url,
        logo_url: item.logo_url || meta?.logoUrl || null,
        job_id: item.job_id || null,
        ats_vendor: item.ats_vendor || (String(item.url || "").includes("linkedin.com") ? "linkedin" : "extension"),
        applied_at: item.applied_at || new Date().toISOString(),
        start_url: item.start_url || startUrl || null,
        apply_url: item.apply_url || applyUrl || null,
        preview_card: {
          title: item.title || meta?.title || "—",
          subtitle: [item.company || meta?.company, item.location || meta?.location].filter(Boolean).join(" • "),
          logo_url: item.logo_url || meta?.logoUrl || null,
          link_url: item.url
        }
      };
      // Call appliedJob; if it fails → fallback markApplied with same payload
      let res = await sendBg({ action: "appliedJob", ...payload }).catch(() => ({ ok: false }));
      if (!res?.ok) {
        res = await sendBg({ action: "markApplied", ...payload }).catch(() => ({ ok: false }));
      }
      if (res?.ok) {
        const when = res.data?.applied_at || payload.applied_at;
        appliedEl.textContent = `Applied before: ${new Date(when).toLocaleString()}`;
      }
      try { await sendBg({ action: 'canonicalListDelete', url: item.url }); } catch {}    //Deleting itek
      showNotice("Added");
      setBusy(markAppliedBtn, false, "Mark applied");
      setTimeout(() => window.close(), 400);
      return;
    } */
    // No buffered canonicals → fallback to current context canonical
    const preferred = meta?.url || ctxFirstCanon || ctxCanon ;       //preferred url
    if (!preferred) {
      setBusy(markAppliedBtn, false, "Mark applied");
      alert("No job to mark. Open a job page first.");
      return;
    }
    const canResp = await sendBg({ action: "canonicalizeUrl", url: preferred });       
    const targetUrl = canResp?.canonical || preferred;

    await saveApplied({                                               //if no canonical, falling back saveapplied(markapplied) with our present meta
      title: meta.title,//|| document.title || "Unknown",
      company: meta.company || "",
      location: meta.location || "",
      url: targetUrl,
      logo_url: meta.logoUrl || null,
      ats_vendor: targetUrl.includes("linkedin.com") ? "linkedin" : "extension",
      applied_at: new Date().toISOString()
    }, appliedEl, meta, startUrl, applyUrl);

    setBusy(markAppliedBtn, false, "Mark applied");
    window.close();
  });

  // Card opens canonical
  jobCard.onclick = (e) => { if (e.target.closest("button") || e.target.closest("a")) return; openJob(); };
  jobCard.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openJob(); } };

  async function openJob() {
    const preferred = ctxFirstCanon || ctxCanon || meta?.url || "";
    if (!preferred) return;
    try {
      const canResp = await sendBg({ action: "canonicalizeUrl", url: preferred });
      const url = canResp?.canonical || preferred;
      chrome.tabs.create({ url });
    } catch { chrome.tabs.create({ url: preferred }); }
  }
}

/* ========== In-popup chooser ========== */
async function openCanonicalChooser(items, appliedEl, markAppliedBtn, ctxMeta) {
  const content = $("#content");
  content.innerHTML = '<div class="muted" style="margin-bottom:6px">Pick the job you just applied:</div>';

  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'job-card';
    div.tabIndex = 0;
    div.innerHTML = `
      <div class="job-card-left">
        <img class="job-logo" alt="logo" src="${it.logo_url || ''}" onerror="this.style.display='none'"/>
      </div>
      <div class="job-card-body">
        <div class="job-title">${it.title || '—'}</div>
        <div class="job-sub">
          <span>${it.company || ''}</span>
          <span class="dot">•</span>
          <span>${it.location || ''}</span>
        </div>
        <a class="job-link" href="${it.url}" target="_blank" rel="noopener">Open job</a>
      </div>`;
    const pick = async () => {
      setBusy(markAppliedBtn, true, "Saving…");
      let ok = false;
      let appliedAt = Date.now();

                                             // 1. Try manualPickCanonical with item url and record saved time
      try {
        const r = await sendBg({ action: 'manualPickCanonical', url: it.url });
        if (r?.ok) {
          ok = true;
          appliedAt = r?.data?.applied_at ? Date.parse(r.data.applied_at) || Date.now() : Date.now();
        }
      } catch {}

                                                     // 2. If manualPickCanonical failed → call appliedJob; if appliedJob fails → markApplied
      if (!ok) {
        try {
          const payload = {
            title: it.title || ctxMeta?.title || "Unknown",
            company: it.company || ctxMeta?.company || "",
            location: it.location || ctxMeta?.location || "",
            url: it.url,
            logo_url: it.logo_url || ctxMeta?.logoUrl || null,
            job_id: it.job_id || null,
            ats_vendor: it.ats_vendor || (String(it.url || "").includes("linkedin.com") ? "linkedin" : "extension"),
            applied_at: it.applied_at || new Date().toISOString(),
            start_url: it.start_url || null,
            apply_url: it.apply_url || null,
            preview_card: {
              title: it.title || ctxMeta?.title || "—",
              subtitle: [it.company || ctxMeta?.company, it.location || ctxMeta?.location].filter(Boolean).join(" • "),
              logo_url: it.logo_url || ctxMeta?.logoUrl || null,
              link_url: it.url
            }
          };
          let res = await sendBg({ action: "markApplied", ...payload }).catch(() => ({ ok: false }));
          /*
          if (!res?.ok) {
            res = await sendBg({ action: "appliedJob", ...payload }).catch(() => ({ ok: false }));
          } */
          if (res?.ok) {
            ok = true;
            appliedAt = res.data?.applied_at ? Date.parse(res.data.applied_at) || Date.now() : Date.now();
          }
        } catch {}
      }

                                                         // 3. Delete from canonical store and update applied time
      try { await sendBg({ action: 'canonicalListDelete', url: it.url }); } catch {}
      setBusy(markAppliedBtn, false, "Mark applied");
      if (ok) {
        appliedEl.textContent = `Applied before: ${new Date(appliedAt).toLocaleString()}`;
        div.remove();
        showNotice("Added");
        if (!content.querySelector('.job-card')) {
          setTimeout(() => window.close(), 400);
        }
      } else {
        alert("Failed to save");
      }
    };
    div.addEventListener('click', pick);
    div.addEventListener('keydown', e => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); pick(); }});
    content.appendChild(div);
  }
}

/* ========== Save helper (applies TCL-aware backend + instant cache via bg) ========== */
async function saveApplied(m, appliedEl, ctxMeta, startUrl, applyUrl) {            
  const payload = {
    action: "markApplied",
    title: m.title || ctxMeta?.title|| '',
    company: m.company || ctxMeta?.company || "",
    location: m.location || ctxMeta?.location || "",
    url: m.url || ctxMeta?.url || "",
    logo_url: m.logo_url || ctxMeta?.logoUrl || null,
    job_id: m.job_id || null,
    ats_vendor: m.ats_vendor || (String(m.url || "").includes("linkedin.com") ? "linkedin" : "extension"),
    applied_at: m.applied_at || new Date().toISOString(),
    start_url: m.start_url || startUrl || null,
    apply_url: m.apply_url || applyUrl || null,
    preview_card: {
      title: (m.title || ctxMeta?.title || "—"),
      subtitle: [m.company || ctxMeta?.company, m.location || ctxMeta?.location].filter(Boolean).join(" • "),
      logo_url: m.logo_url || ctxMeta?.logoUrl || null,
      link_url: m.url || ctxMeta?.url || ""
    }
  };
  let res = await sendBg(payload).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  /*
  if (!res?.ok) {
    // legacy fallback
    res = await sendBg({
      action: "appliedJob",
      title: payload.title, company: payload.company, location: payload.location, url: payload.url,
      logo_url: payload.logo_url, job_id: payload.job_id, applied_at: payload.applied_at,
      start_url: payload.start_url, apply_url: payload.apply_url, preview_card: payload.preview_card
    }).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  } */
  if (res?.ok) {
    const when = res.data?.applied_at || payload.applied_at;
    appliedEl.textContent = `Applied before: ${new Date(when).toLocaleString()}`;
  } else {
    alert(res?.error || "Failed to save");
  }
}

/* helpers */
function $(sel) { const el = document.querySelector(sel.startsWith("#") ? sel : `#${sel}`); if (!el) throw new Error(`Missing element: ${sel}`); return el; }
function nonEmptyMerge(base, patch) { const out = { ...base }; for (const [k, v] of Object.entries(patch || {})) { if (v !== undefined && v !== null && String(v).trim() !== "") out[k] = v; } return out; }
//function sendBg(payload) { return new Promise((resolve, reject) => { try { chrome.runtime.sendMessage(payload, (resp) => resolve(resp)); } catch (e) { reject(e); } }); }
//function sendTab(tabId, payload) { return new Promise((resolve, reject) => { try { chrome.tabs.sendMessage(tabId, payload, (resp) => resolve(resp)); } catch (e) { reject(e); } }); }
function sendBg(payload, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok:false, error:'timeout' }); } }, timeoutMs);
    try {
      chrome.runtime.sendMessage(payload, (resp) => {
        if (done) return;
        done = true; clearTimeout(t);
        if (chrome.runtime.lastError) return resolve({ ok:false, error: chrome.runtime.lastError.message });
        resolve(resp);
      });
    } catch (e) {
      if (done) return;
      done = true; clearTimeout(t);
      resolve({ ok:false, error: String(e?.message || e) });
    }
  });
}
function sendTab(tabId, payload, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok:false, error:'timeout' }); } }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, payload, (resp) => {
        if (done) return;
        done = true; clearTimeout(t);
        if (chrome.runtime.lastError) return resolve({ ok:false, error: chrome.runtime.lastError.message });
        resolve(resp);
      });
    } catch (e) {
      if (done) return;
      done = true; clearTimeout(t);
      resolve({ ok:false, error: String(e?.message || e) });
    }
  });
}
// Proxy any request to the tab's "primary" frame (ATS iframe if present)
function sendToPrimaryFrame(tabId, payload, timeoutMs = 2000) {
  // background.js implements action:'proxyToPrimaryFrame'
  //return sendBg(tabId,{ action: 'proxyToPrimaryFrame', payload, timeoutMs });
  return sendBg({ action: 'proxyToPrimaryFrame', tabId, payload, timeoutMs });
}

function getActiveTab() { return new Promise((resolve, reject) => { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { if (chrome.runtime.lastError || !tabs || !tabs.length) return reject("No active tab"); resolve(tabs[0]); }); }); }
function pill(txt, cls) { const s = document.createElement("span"); s.className = `pill ${cls}`; s.textContent = txt; return s; }
function setBusy(btn, busy, label) { btn.disabled = !!busy; btn.textContent = busy ? "…" : label; }

let toastTimer;

function showNotice(msg = "Added") {
  const id = "__jobAidPopupToast__";
  let t = document.getElementById(id);

  if (!t) {
    t = document.createElement("div");
    t.id = id;
    Object.assign(t.style, {
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: "16px",
      background: "#111827",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "10px",
      font: "12px system-ui",
      zIndex: 2147483647,
      boxShadow: "0 6px 22px rgba(0,0,0,.24)",
      opacity: "0",
      transition: "opacity .18s ease"
    });
    document.body.appendChild(t);
  }

  t.textContent = msg;
  t.style.opacity = "1";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 220);
  }, 1400);
}

window.__JA_busyAutofill = false;   // true while autofill runs
let __JA_pauseUntil = 0;

function pauseDetections(ms = 1200) {
  __JA_pauseUntil = Math.max(__JA_pauseUntil, performance.now() + ms);
}
async function runAutofill() {
  try {
    const tab = await getActiveTab();
    const data = await new Promise((resolve) => { chrome.storage.local.get("autofillData", (r) => resolve(r.autofillData || null)); });
    console.log('Data in popup:',data);
    const bundleURL = chrome.runtime.getURL("autofill.bundle.js");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (url, token, data) => {
        const script = document.createElement("script");
        script.type = "module"; script.src = url; script.id = "autofill-script";
        script.onload = () => {
          import(url).then((module) => {
            if (module && typeof module.autofillInit === "function") {
              try { 
                window.__JA_busyAutofill = true;
                pauseDetections(250); // quiet period while we interact
                module.autofillInit(token, data);
                window.__JA_busyAutofill = false;
                pauseDetections(250);  // small tail to let DOM settle 
              } 
              catch (e) { console.error(e); }
            } else { console.error("Autofill Init export is not found."); }
          }).catch((err) => console.error("Error importing module:", err));
        };
        script.onerror = () => console.error(`Failed to load script: ${url}`);
        document.head.appendChild(script);
      },
      args: [bundleURL, "", data]
    });
  } catch (error) { console.error(error); }
} 
console.log("popup.js loaded");


/*
1. getJobContext — pass tabId (line 33)

Added tabId: tab?.id so the background can key off the active tab's jobCtxByTab entry when the popup has no sender.tab.id.
2. Snapshot retrieval — separate presentJourneySnap / referrerJourneySnap (lines 44–66)

Renamed journeySnap → presentJourneySnap; added referrerJourneySnap for the referrer fallback call.
Added tabId: tab?.id to the first call (present tab).
Fixed broken catch blocks — jRes was referenced in catch scope where it wasn't visible (replaced with e).
Referrer call only sets startUrl/applyUrl if not already set by the present call.
3. Meta selection logic (lines 67–85)

isTrueCanonicalPage → use jobctxByTab meta (already merged; showCard = true)
Else presentJourneySnap → merge it into meta; showCard = true
Else referrerJourneySnap → merge it into meta; showCard = true
Else → showCard = false
Fixed the journSnap typo (was crashing silently).
4. submissionDetected — referrer + waitForUser handling (lines 199–220)

Changed referrer: to startUrl || document.referrer || '' so background's tabByStartUrl lookup can find the right journey bag when calling from popup.
If subres.ok && subres.waitForUser → update appliedEl text and keep button busy (return). Previously this case was silently ignored and fell through to the canonical list flow.
If subres.ok && !waitForUser → show "Added" + close (unchanged).
5. Single-item flow — inline appliedJob → markApplied fallback (items.length === 1)

Replaced the opaque saveApplied() call with an explicit inline payload build.
Calls appliedJob; if that fails, calls markApplied with the same payload.
Updates appliedEl with the timestamp from the response, then deletes from canonical store.
6. Chooser pick handler — manualPickCanonical → appliedJob → markApplied

If manualPickCanonical fails → build payload from item + ctxMeta, call appliedJob; if that also fails → call markApplied.
If manualPickCanonical succeeds → perform mark-applied UI actions (update text, toast, close).
Always deletes from canonical store at the end (step 7.1.3).*/