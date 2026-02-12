import { allSkills } from "../../../core/state.js";

/* ==== skills banner kept as-is except gated by allowUI ==== */
//For Ashby we are using different code for inserting because the existing code is making the banner disapper because of ashby dom nodes being reset.
function displayMatchingPerecentage(pct, matched) {

  //if (!ROLE_PARSE) return; // banner only in the parsing context

  if (!Array.isArray(allSkills) || allSkills.length === 0) return;

  const hostId = 'jobAidSkillBannerHost';
  let host = document.getElementById(hostId);
  // choose one primary container to own the banner
  //const primary = selectPrimaryJobBlock();
  //const insertRoot = primary || document.querySelector('main') || document.body;
  // find title within the chosen root (not the whole document)
  const insertRoot = document.body;
  const titleSel = [
    ".jobsearch-JobInfoHeader-title",".top-card-layout__title",
    ".jobs-unified-top-card__job-title",".jobs-unified-top-card__title","h1[data-test-job-title]",
    "h1[data-cy='jobTitle']","[data-testid='jobTitle']", '.titlepage','[itemprop="title"]',
    '[data-careersite-property="title"]',".jobTitle","h1.job-title",
    'h1 a#main-skip-content','a#main-skip-content',"#overview","[data-automation-id='jobPostingHeader']", '.jv-header','[itemprop="title"]', '[data-careersite-property="title"]',"h1"
  ];
  let titleEl = null;
  for (const s of titleSel) { const el = insertRoot.querySelector(s); if (el) { titleEl = el; break; } }

  if (host && !insertRoot.contains(host)) {
    console.warn('[banner] removing host because insertRoot changed', {
      oldHostConnected: host.isConnected,
      insertRootTag: insertRoot?.tagName,
      insertRootClass: insertRoot?.className
    });
    console.trace('[banner] removal stack');
    host.remove();
    host = null;
  }


  // if an existing banner is mounted outside our chosen root (duplication scenario), remove & recreate
  //if (host && !insertRoot.contains(host)) { try { host.remove(); } catch {} host = null; }

  if (!host) {
    host = document.createElement('div'); host.id = hostId;

    if (titleEl?.parentElement) titleEl.parentElement.insertBefore(host, titleEl.nextSibling);
    else insertRoot.insertBefore(host, insertRoot.firstChild || null);

    const shadow = host.attachShadow({ mode: 'open' }); 
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes border-move { 0% { --angle: 0deg; } 100% { --angle: 360deg; } }
      .box { --angle: 0deg; box-sizing: border-box; width: 100%; margin: 10px 0; padding: 10px 12px;
             border-radius: 12px; background: #fff; position: relative; }
      .box::before { content: ""; position: absolute; inset: -2px; border-radius: 14px;
        background: conic-gradient(from var(--angle), #6366f1 0%, #22c55e 25%, #06b6d4 50%, #f59e0b 75%, #6366f1 100%);
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude; padding: 2px; z-index: 0; animation: border-move 4s linear infinite; }
      .inner { position: relative; z-index: 1; }
      .score { font-weight: 800; font-size: 14px; color: #1e3a8a; }
      .row { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      .label { font-size: 12px; color: #374151; font-weight: 700; margin-right: 6px; }
      .pill { display: inline-block; padding: 4px 8px; border-radius: 9999px;
              background: #f3f4f6; border: 1px solid #e5e7eb; font-size: 12px; color: #111827; }
      .pill.miss { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
    `;
    const root = document.createElement('div'); root.className = 'box';
    root.innerHTML = `
      <div class="inner">
        <div class="score" id="score"></div>
        <div class="row"><span class="label" id="matchLabel"></span><div class="row" id="matchList"></div></div>
        <div class="row"><span class="label" id="unmatchLabel"></span><div class="row" id="unmatchList"></div></div>
      </div>
    `;
    shadow.appendChild(style); shadow.appendChild(root);

  } else if (!host.isConnected) {
    // rare SPA remounts
    if (titleEl?.parentElement) titleEl.parentElement.insertBefore(host, titleEl.nextSibling);
    else insertRoot.insertBefore(host, insertRoot.firstChild || null);
  }

  const scoreEl = host.shadowRoot.getElementById('score');
  const matchLabel = host.shadowRoot.getElementById('matchLabel');
  const unmatchLabel = host.shadowRoot.getElementById('unmatchLabel');
  const matchList = host.shadowRoot.getElementById('matchList');
  const unmatchList = host.shadowRoot.getElementById('unmatchList');

  const jd = Array.isArray(allSkills) ? allSkills : [];
  const mset = new Set((matched || []).map(x => (x || '').toLowerCase()));
  const unmatched = jd.filter(x => !mset.has((x || '').toLowerCase()));

  scoreEl.textContent = `Skill match: ${Math.round(pct || 0)}%`;
  matchLabel.textContent = `Matched (${matched.length}/${jd.length})`;
  unmatchLabel.textContent = `Unmatched (${unmatched.length}/${jd.length})`;

  matchList.innerHTML = '';
  matched.slice(0, 120).forEach(s => { const p = document.createElement('span'); p.className = 'pill'; p.textContent = s; matchList.appendChild(p); });

  unmatchList.innerHTML = '';
  unmatched.slice(0, 120).forEach(s => { const p = document.createElement('span'); p.className = 'pill miss'; p.textContent = s; unmatchList.appendChild(p); });
}

// Exports
export { displayMatchingPerecentage };
