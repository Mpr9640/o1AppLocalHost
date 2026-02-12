//# finding job title 
//'[data-automation-id="jobPostingHeader"]', for workday
//For ICIMS, 'h1 a#main-skip-content','a#main-skip-content',
//for ey,     '[itemprop="title"]','[data-careersite-property="title"]',
//For glassdoor: h1[id^="jd-job-title"]
function findJobTitleEl() {
  const sels = [
    'h1 a#main-skip-content',
    'a#main-skip-content',
    '.jobsearch-JobInfoHeader-title',
    '[data-automation-id="jobPostingHeader"]',
    '.titlepage',
    '.top-card-layout__title',
    '.jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__title',
    'h1[data-test-job-title]',
    '[data-test-job-title]',
    'h1[data-cy="jobTitle"]',
    '[data-testid="jobTitle"]',
    '[itemprop="title"]',
    '[data-careersite-property="title"]',
    '.jobTitle',
    'h1.job-title',
    '.jv-header', // For JOb vite
    'h1[id^="jd-job-title"]',
    'h1'
  ];

  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) {
      const txt = (el.textContent || '').trim();
      console.log('[jobTitle] matched selector:', sel, '=>', txt, el);
      return el;
    }
  }

  console.log('[jobTitle] no selector matched from sels');
  return null;
}

function titleLooksSane(t) {
  const s = (t||'').trim();
  if (!s) return false;
  if (s.length < 3 || s.length > 160) return false;
  if (/^chatgpt$/i.test(s)) return false;
  return true;
}

function getJobTitleStrict() {
  const sels = [
    '[data-automation-id="jobPostingHeader"] h1','.jobsearch-JobInfoHeader-title','.top-card-layout__title',
    '.jobs-unified-top-card__job-title','.jobs-unified-top-card__title','h1[data-test-job-title]','h1[data-cy="jobTitle"]',
    '[data-testid="jobTitle"]','.jobTitle','h1.job-title','h1'
  ];
  for (const sel of sels) { const t = document.querySelector(sel)?.textContent?.trim(); if (t) return t; }
  return document.title || '';
}

// Exports
export { findJobTitleEl, titleLooksSane, getJobTitleStrict };
