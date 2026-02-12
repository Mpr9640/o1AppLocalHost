//NOTES: using manual pick canonical . applied job action if not than using mark applied action.
document.addEventListener("DOMContentLoaded", init);

const APP_HOME = "http://localhost:3000/home";

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
  let ctx = null;
  try { const r = await sendBg({ action: "getJobContext" }); ctx = r?.ctx || null; } catch {}
  const ctxMeta = ctx?.meta || {};
  const ctxFirstCanon = ctx?.first_canonical || "";
  const ctxCanon = ctx?.canonical || ctxFirstCanon || "";
  console.log('1.In popup ctx received',ctxMeta,ctxFirstCanon,ctxCanon);
  // Ask the tab if UI should be allowed (journey-only)
  //let det = null;
  //if (tab?.id) {
    //try { det = await sendTab(tab.id, { action: "getDetectionState" }); } catch {}
  //}
  //const allowUI = !!det?.allowUI && (det?.tier === "medium" || det?.tier === "high");
  //console.log('2. In popup allow UI',allowUI);

  // Merge ONLY sticky ctx into meta (keeps canonical steady)
  let meta = { title: "", company: "", location: "", logoUrl: "", url: ctxFirstCanon || ctxCanon || (tab?.url || "") };
  meta = nonEmptyMerge(meta, ctxMeta);
  if (!meta.url) meta.url = ctxFirstCanon || ctxCanon || tab?.url || "";
  console.log('3. IN popup after merge the meta',meta);
  let showCard = false;
  let renderCanon = ""; // which canonical URL the card should open
  let tabCanon = "";
  let isTrueCanonicalPage = false;

  try {
    // Current tab's canonicalized URL
    const canRespTab = await sendBg({ action: "canonicalizeUrl", url: tab?.url || "" });
    tabCanon = canRespTab?.canonical || tab?.url || "";
    console.log('4. In popup the canonicalize url of present tab',tabCanon);
    // Ask the page to score itself (uses hasApply/TCL/JD under the hood)
    let scoreResp = null;
    if (tab?.id) {
      scoreResp = await sendTab(tab.id, { action: "getCanonicalScore" }).catch(() => null);
      //scoreResp = await sendToPrimaryFrame(tab.id, { action: "getCanonicalScore" }).catch(() => null);
    }
    // Treat ≥0.6 as “true canonical detail page” (TCL/JD and/or Apply visible)
    isTrueCanonicalPage = !!(scoreResp && typeof scoreResp.score === "number" && scoreResp.score >= 0.6);
    console.log('5. in popup checking the present page is true canonical page or not',isTrueCanonicalPage);
    const journeyStartCanon = ctx?.first_canonical || ""; // frozen at first real detail page
    if (isTrueCanonicalPage) {
      // still on the actual detail page → render that page’s canonical
      showCard = true;
      renderCanon = tabCanon || journeyStartCanon || "";   //2.fix
      console.log('6. In popup the present page is canonical than showing card,render canon is ',renderCanon);
    } else if (journeyStartCanon) {
      // in the application flow (ATS/thank-you/etc.) → render the journey start canonical
      showCard = true;
      renderCanon = journeyStartCanon;
      console.log('7. In popup the present page is no canonical than showing card but no details with first canonical url,render canon is ',renderCanon);
    } else {
      // neither a true detail page nor a known journey → hide
      showCard = false;
      renderCanon = "";
    }
  } catch {
    showCard = false;
    renderCanon = "";
  }

  // Apply the decision into meta/url so the link/button uses the right canonical
  if (showCard) {
    if (renderCanon) meta.url = renderCanon;
    console.log('8. In popup we got show card so we are updating the meta url with rendercanon rl',renderCanon);
  } else {
    meta.url = meta.url || ""; // keep safe default
  }


  // Lookup applied (URL or TCL)
  let appliedText = "Not applied yet";
  if (tabCanon/*meta.url*/) {
    try {
      const canResp = await sendBg({ action: "canonicalizeUrl", url: tabCanon/*meta.url*/ });
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

  // Render card (only if allowed + strict canonical gate)
  //const canShowCard = !!(allowUI && showCard);
  // If we have an active card meta from the page, allow showing the card even when allowUI/showCard are false.
  //const canShowCard = !!(
    //(allowUI && showCard) // ||
    //(companyMeta && (companyMeta.title || companyMeta.company))
  //);
  //const companyMeta = tab?.id ? await sendTab(tab.id, { action: "getActiveCompanyMeta" }).catch(()=>null) : null;
  //if (companyMeta) meta = nonEmptyMerge(meta, companyMeta);
  const companyMeta = tab?.id ? await sendTab(tab.id, { action: "getActiveCompanyMeta" }).catch(()=>null) : null;
  //const companyMeta = tab?.id ? await sendToPrimaryFrame(tab.id, { action: "getActiveCompanyMeta" }).catch(()=>null) : null;
  console.log('10. In popup , getting active company meta',companyMeta);
  if (companyMeta && (companyMeta.title || companyMeta.company || companyMeta.location || companyMeta.logoUrl || companyMeta.url)) {
    meta = nonEmptyMerge(meta, companyMeta);
    // if the list’s active-card URL exists, use it for the link
    if (companyMeta.url) meta.url = companyMeta.url;
    console.log('11. In popup ,after getting active company meta final meta',companyMeta);
  }
  const hasMeta = !!(meta.title || meta.company || meta.location || meta.logoUrl);
  console.log('12. In popup final meta',meta);
  if (showCard && hasMeta) {
    console.log('13. In popup, came inside for diaplaying job card');
    jobTitle.textContent = meta.title || "—";
    jobCompany.textContent = meta.company || "—";
    jobLocation.textContent = meta.location || "—";
    jobLink.href = meta.url || "#";

    const dotEl = document.querySelector(".job-sub .dot");
    if (dotEl) dotEl.style.display = (meta.company && meta.location) ? "inline" : "none";

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

  
  // Hide skills in popup (banner is on-page)
  //scoreEl.hidden = true ; matchesRow.hidden = true; othersRow.hidden = true;
  // Skills UI
  // Render-first: fetch skill state after first paint (banner is on-page too)
  //scoreEl.hidden = true; matchesRow.hidden = true; othersRow.hidden = true;
  /*function jobskillsdisplay(tab){
    requestAnimationFrame(async () => {
      if (!tab?.id) return;
      try {
        const stateFromTab = await sendTab(tab.id, { action: "getSkillMatchState" });
        const percentage = Number(stateFromTab?.percentage || 0);
        const matchedWords = Array.isArray(stateFromTab?.matchedWords) ? stateFromTab.matchedWords : [];
        const allSkills = Array.isArray(stateFromTab?.allSkills) ? stateFromTab.allSkills : [];
        if (allSkills.length > 0) {
          scoreEl.hidden = false; matchesRow.hidden = false; othersRow.hidden = false;
          scoreEl.textContent = `Skill match: ${Math.round(percentage)}%`;
          matchesEl.innerHTML = ""; othersEl.innerHTML = "";
          matchedWords.slice(0, 50).forEach((s) => matchesEl.appendChild(pill(s, "match")));
          const mset = new Set(matchedWords.map((x) => (x || "").toLowerCase()));
          const others = allSkills.filter((x) => !mset.has((x || "").toLowerCase()));
          others.slice(0, 50).forEach((s) => othersEl.appendChild(pill(s, "other")));
        }
      } catch {}
    }); 

  }*/
  /*
  let stateFromTab = null;
  if (tab?.id) {
    try { stateFromTab = await sendTab(tab.id, { action: "getSkillMatchState" }); } catch {}
  }
  const percentage = Number(stateFromTab?.percentage || 0);
  const matchedWords = Array.isArray(stateFromTab?.matchedWords) ? stateFromTab.matchedWords : [];
  const allSkills = Array.isArray(stateFromTab?.allSkills) ? stateFromTab.allSkills : [];

  const hasJD = Array.isArray(allSkills) && allSkills.length > 0;
  if (hasJD) {
    console.log('13. In popup, checking the jd',jd)
    scoreEl.hidden = false; matchesRow.hidden = false; othersRow.hidden = false;
    scoreEl.textContent = `Skill match: ${Math.round(percentage)}%`;
    matchesEl.innerHTML = ""; othersEl.innerHTML = "";
    matchedWords.slice(0, 50).forEach((s) => matchesEl.appendChild(pill(s, "match")));
    const mset = new Set(matchedWords.map((x) => (x || "").toLowerCase()));
    const others = allSkills.filter((x) => !mset.has((x || "").toLowerCase()));
    others.slice(0, 50).forEach((s) => othersEl.appendChild(pill(s, "other")));
  } else {
    scoreEl.hidden = true; matchesRow.hidden = true; othersRow.hidden = true;
  }
    */
  
  async function getSkillStateWithRetry(tabId) {
    let s = await sendTab(tabId, { action: "getSkillMatchState" });
    if (!s || !Array.isArray(s.allSkills) || s.allSkills.length === 0) {
      await new Promise(r => setTimeout(r, 200)); // tiny backoff
      s = await sendTab(tabId, { action: "getSkillMatchState" });
    }
    return s;
  }
 /*
  async function getSkillStateWithRetry(tabId) {
    let s = await sendToPrimaryFrame(tabId, { action: "getSkillMatchState" });
    if (!s || !Array.isArray(s.allSkills) || s.allSkills.length === 0) {
      await new Promise(r => setTimeout(r, 200));
      s = await sendToPrimaryFrame(tabId, { action: "getSkillMatchState" });
    }
    return s;
  }
  */
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
  /*
  // Buttons
  openAppBtn.addEventListener("click", async () => { await chrome.tabs.create({ url: APP_HOME }); window.close(); });
  //viewSkillsBtn.disabled = !allowUI;
  viewSkillsBtn.addEventListener("click", async () => {
    if (!tab?.id) return;
    const res = await sendTab(tab.id, { action: "openSkillsPanel" });
    if(res?.ok === false){
      alert('NO JD FOUND');
    }
    window.close();
  
  });
  */
 // popup.js (FINAL ROBUST VERSION)

  viewSkillsBtn.addEventListener("click", async () => {
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
          alert('NO JD FOUND');
          
      } catch (error) {
          // 3. REJECTION/CONNECTION FAILURE PATH: The message port closed, the tab was gone, or the content script didn't reply properly.
          console.error("Messaging failed (Port closed or other error):", error);
          alert('NO JD FOUND (Messaging Error)');
      }
      
      // Crucially, if there was an error or explicit failure, we don't close the window here.
  });

 /*
  viewSkillsBtn.addEventListener("click", async () => {
    if (!tab?.id) return;
    const res = await sendToPrimaryFrame(tab.id, { action: "openSkillsPanel" });
    if (res?.ok === false) { alert("No Jd found."); }
    window.close();
  });
  */
  autofillBtn.addEventListener("click", () => runAutofill());

  // Manual “Mark applied” with in-popup chooser
  markAppliedBtn.addEventListener("click", async () => {
    //if (!allowUI) { alert("Open a job page first."); return; }
    setBusy(markAppliedBtn, true, "Preparing…");

    // Pull the current canonical list from bg (most-recent-first)
    let items = [];
    try {
      const r = await sendBg({ action: "getCanonicalList" });
      if (Array.isArray(r?.items)) {
        items = r.items.map(x => ({
          url: x.url,
          title: x.title || "Unknown",
          company: x.company || "",
          location: x.location || "",
          logo_url: x.logo_url || null,
          ats_vendor: (x.url || "").includes("linkedin.com") ? "linkedin" : "extension",
          applied_at: x.submitted_at || null
        }));
      }
    } catch {}

    if (items.length > 1) {
      await openCanonicalChooser(items, appliedEl, markAppliedBtn, meta); // render chooser inside popup
      //showNotice('Added');
      setBusy(markAppliedBtn, false, "Mark applied");
      return;
    }
    if (items.length === 1) {
      await saveApplied(items[0], appliedEl, meta);
      try { await sendBg({ action: 'canonicalListDelete', url: items[0].url }); } catch {}
      showNotice("Added");
      setBusy(markAppliedBtn, false, "Mark applied");
      setTimeout(() => window.close(), 400);
      return;
    }
    // No buffered canonicals → fallback to current context canonical
    const preferred = meta?.url || ctxFirstCanon || ctxCanon || (tab?.url || "");
    if (!preferred) {
      setBusy(markAppliedBtn, false, "Mark applied");
      alert("No job to mark. Open a job page first.");
      return;
    }
    const canResp = await sendBg({ action: "canonicalizeUrl", url: preferred });
    const targetUrl = canResp?.canonical || preferred;

    await saveApplied({
      title: meta.title || document.title || "Unknown",
      company: meta.company || "",
      location: meta.location || "",
      url: targetUrl,
      logo_url: meta.logoUrl || null,
      ats_vendor: targetUrl.includes("linkedin.com") ? "linkedin" : "extension",
      applied_at: new Date().toISOString()
    }, appliedEl, meta);

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
      // 1) Try background's manual helper (if it both saves + cleans up)
      let ok = false;
      let appliedAt = Date.now();
      let err = null;
      try {
        const r = await sendBg({ action: 'manualPickCanonical', url: it.url });
        if (r?.ok) {
          ok = true;
          appliedAt = r?.data?.applied_at ? Date.parse(r.data.applied_at) || Date.now() : Date.now();
        }
      } catch (e) {
        err = e;
      }
      // 2) If manualPickCanonical not available or failed, fall back to direct save
      if (!ok) {
        try {
          const res = await saveApplied(it, appliedEl, ctxMeta);
          if (res?.ok !== false) { // saveApplied doesn't return ok in your code; treat no-error as success
            ok = true;
          }
        } catch (e) {
          err = e;
        }
      }
      // 3) Regardless, request deletion from the canonical store (idempotent on bg)
      try {
        await sendBg({ action: 'canonicalListDelete', url: it.url });
      } catch {}

      setBusy(markAppliedBtn, false, "Mark applied");
      if (ok) {
        // update “Applied before” line
        appliedEl.textContent = `Applied before: ${new Date(appliedAt).toLocaleString()}`;

        // local UI cleanup: remove the picked card, toast, and close if empty
        div.remove();
        showNotice("Added");
        // if no more candidates, close the popup
        if (!content.querySelector('.job-card')) {
          setTimeout(() => window.close(), 400);
        }
      } else {
        alert((err && err.message) || "Failed to save");
      }
    };
    div.addEventListener('click', pick);
    div.addEventListener('keydown', e => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); pick(); }});
    content.appendChild(div);
  }
}

/* ========== Save helper (applies TCL-aware backend + instant cache via bg) ========== */
async function saveApplied(m, appliedEl, ctxMeta) {
  const payload = {
    action: "appliedJob",
    title: m.title || ctxMeta?.title || document.title || "Unknown",
    company: m.company || ctxMeta?.company || "",
    location: m.location || ctxMeta?.location || "",
    url: m.url || ctxMeta?.url || "",
    logo_url: m.logo_url || ctxMeta?.logoUrl || null,
    job_id: m.job_id || null,
    ats_vendor: m.ats_vendor || (String(m.url || "").includes("linkedin.com") ? "linkedin" : "extension"),
    applied_at: m.applied_at || new Date().toISOString(),
    preview_card: {
      title: (m.title || ctxMeta?.title || "—"),
      subtitle: [m.company || ctxMeta?.company, m.location || ctxMeta?.location].filter(Boolean).join(" • "),
      logo_url: m.logo_url || ctxMeta?.logoUrl || null,
      link_url: m.url || ctxMeta?.url || ""
    }
  };
  let res = await sendBg(payload).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  if (!res?.ok) {
    // legacy fallback
    res = await sendBg({
      action: "markApplied",
      title: payload.title, company: payload.company, location: payload.location, url: payload.url,
      logo_url: payload.logo_url, job_id: payload.job_id, applied_at: payload.applied_at, preview_card: payload.preview_card
    }).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  }
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

// lightweight popup toast
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
  setTimeout(() => {
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
async function runAutofill() {
  try {
    // get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    // get data to pass into autofillInit
    const { autofillData = null } = await chrome.storage.local.get("autofillData");

    // 1) In ISOLATED world, bootstrap and dynamic-import your module
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "ISOLATED",
      func: (data, modulePath) => {
        // per-frame guard to avoid duplicate init
        if (globalThis.__JA_AUTOFRAME_BUSY__) return;
        globalThis.__JA_AUTOFRAME_BUSY__ = true;

        const url = chrome.runtime.getURL(modulePath);
        import(url)
          .then((mod) => {
            if (mod && typeof mod.autofillInit === "function") {
              // token not used; pass empty string to keep signature compatible
              return mod.autofillInit("", data);
            } else {
              console.error("[runAutofill] autofillInit export not found in", url);
            }
          })
          .catch((err) => {
            console.error("[runAutofill] dynamic import failed:", err);
          })
          .finally(() => {
            // allow future manual re-runs if needed
            setTimeout(() => { try { delete globalThis.__JA_AUTOFRAME_BUSY__; } catch {} }, 2000);
          });
      },
      args: [autofillData, "autofill.bundle.js"], // <-- keep this file name in sync with your build
    });
  } catch (err) {
    console.error("[runAutofill] failed:", err);
  }
}*/