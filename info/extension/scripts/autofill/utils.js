function isElementVisible(el){
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return false;

  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;

  if ((rect.bottom < 0 && rect.top < 0) || (rect.right < 0 && rect.left < 0)) return false;

  for (let n = el; n; n = n.parentElement){
    if (n.hidden) return false;
    if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return false;
    if ('inert' in n && n.inert) return false;
  }
  return true;
}
const isVisible = isElementVisible;
function normalizeFieldName(s){
  return (s||'').toString().toLowerCase().replace(/\s/g,'').replace(/[^a-z0-9]/g,'').trim();
}
// Robust visibility check: element must be rendered and not in a hidden ancestor
function isEffectivelyVisible(el) {
  if (!el || !el.ownerDocument) return false;

  const doc = el.ownerDocument;
  const view = doc.defaultView || window;

  let node = el;
  while (node && node.nodeType === 1) {
    // Guard: if getComputedStyle blows up, treat as not visible
    let style;
    try {
      style = view.getComputedStyle(node);
    } catch (e) {
      return false;
    }

    if (!style) return false;

    // CSS hidden
    if (style.display === 'none' || style.visibility === 'hidden' ) { //|| style.opacity === '0'
      return false;
    }

    // Attribute / ARIA hidden
    if (
      node.hasAttribute('hidden') ||
      node.getAttribute('aria-hidden') === 'true' ||
      node.hasAttribute('inert')
    ) {
      return false;
    }

    node = node.parentElement;
  }

  // Geometry visibility (non-zero box)
  try {
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return false;
  } catch (e) {
    // If we can't compute rect, assume not visible
    return false;
  }

  return true;
}

function normalizeFieldNameWithSpace(s){
  return (s||'').toString()
    .replace(/([a-z])([A-Z])/g,'$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g, ' ')
    .replace(/'s\b/g, 's')
    .trim();
}
function normalizeOptionText(text) {
  return (text||'').split('-')[0].replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
} 
//Function for normalization ob booleans
function normalizeToBooleanLike(v){
  const s = normalizeOptionText(String(v));
  if (BOOL_TRUE.has(s)) return 'yes';
  if (BOOL_FALSE.has(s)) return 'no';
  return s;
}

//Step defingin a best way to seelct the semantic option related to degree.
function norm(s){
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[\u2019']/g,'')
    .replace(/[^a-z0-9+%&().,\-\/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const normQ = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function normalizeName(str) {
  return (str || '').toLowerCase().trim();
}
function normalize(s){ return normalizeFieldNameWithSpace(s||''); }
function waitForDomStable({ timeoutMs = 2500, quietMs = 180 } = {}) {
  return new Promise(resolve => {
    let timer = setTimeout(done, timeoutMs);
    let idle;
    const mo = new MutationObserver(() => {
      clearTimeout(idle);
      idle = setTimeout(done, quietMs);
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    function done(){
      mo.disconnect();
      clearTimeout(timer);
      resolve();
    }
  });
}
function stripRequiredAsterisk(s){ return s.replace(/\s*[:*]\s*$/, ''); }
///====Hosts
// OPTIONAL: Workday hints
function isWorkdayHost() {
  const h = location.hostname;
  return /\.myworkdayjobs\.com$/i.test(h) || /\.wd\d+\.myworkdayjobs\.com$/i.test(h) || /\.myworkdaysite\.com$/i.test(h) ;
}
const isAshbyHost = /(?:^|\.)ashbyhq\.com$/i.test(location.hostname);
const isSuccessHost = /(?:^|\.)successfactors\.com$/i.test(location.hostname);
const isSuccessEuHost = /(?:^|\.)successfactors\.eu$/i.test(location.hostname);
const isGreenhouseHost = /(?:^|\.)greenhouse\.io$/i.test(location.hostname);
const isPowerHost = /(?:^|\.)powerhrg\.com$/i.test(location.hostname);
const isApexApplyHost = /(?:^|\.)itcareersapply\.apexsystems\.com$/i.test(location.hostname);
///ICIMS host related 
const isIcimsHost = /(?:^|\.)icims\.(?:com|co)$/i.test(location.hostname);
const isMetaHost = /(^|\.)metacareers\.com$/i.test(location.hostname);
const isJobCaseHost = /^([a-z0-9-]+\.)*jobcase\.com$/i.test(location.hostname);
const isWorkableJobsHost = /(?:^|\.)jobs\.workable\.com$/i.test(location.hostname);
const isApplyWorkableHost = /(?:^|\.)apply\.workable\.com$/i.test(location.hostname);
const isLeverHost = /(?:^|\.)lever\.co$/i.test(location.hostname);
const isPaylocityHost = /(?:^|\.)paylocity\.com$/i.test(location.hostname);
const isCheckwritersrecruitHost =/(^|\.)checkwritersrecruit\.com$/i.test(location.hostname);
const isFidelityHost = /(?:^|\.)fidelity\.com$/i.test(location.hostname);
const isNjoynHost = /(^|\.)njoyn\.com$/i.test(location.hostname);
// ClearCompany ATS (e.g. addus.clearcompany.com)
const isClearCompanyHost = /(^|\.)clearcompany\.com$/i.test(location.hostname);
//For smartrecruiter resume related.
const isSmartRecruitersHost =
  /(^|\.)smartrecruiters\.com$/i.test(location.hostname);
const isSmartRecruitersCareersHost =
  /(^|\.)smartrecruiterscareers\.com$/i.test(location.hostname);
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
// Booleans / Options =====
const BOOL_TRUE = new Set(['yes','y','true','t','1','accept','agree','iagree','optin','on','currentlyworking','currentlystudying']);
const BOOL_FALSE = new Set(['no','n','false','f','0','decline','disagree','i do not agree','optout','off','notcurrentlyworking','notcurrentlystudying']);
export {normalize, normalizeName, norm, normalizeToBooleanLike, normalizeOptionText, normalizeFieldNameWithSpace
    , normalizeFieldName, normQ, isVisible, isElementVisible, waitForDomStable,isEffectivelyVisible,stripRequiredAsterisk,
    isAshbyHost,
    isWorkdayHost,
    isSuccessHost,
    isSuccessEuHost,
    isGreenhouseHost,
    isPowerHost,
    isApexApplyHost,
    isIcimsHost,
    isMetaHost,
    isJobCaseHost,
    isWorkableJobsHost,
    isApplyWorkableHost,
    isLeverHost,
    isPaylocityHost,
    isCheckwritersrecruitHost,
    isFidelityHost,
    isNjoynHost,
    isClearCompanyHost,
    isSmartRecruitersCareersHost,
    isSmartRecruitersHost,
    delay,BOOL_FALSE,BOOL_TRUE
};