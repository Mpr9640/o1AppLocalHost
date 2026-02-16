
import { isLinkedInHost, LI_NEGATIVE_PATH } from "../../../core/hosts.js";
import { absUrl, safeURL, isVisible } from "../../../core/utils.js";
import { findJobTitleEl } from "../jobtitle/jobTitle.js";
import { getCompanyName } from "../jobcompany/jobCompanyMain.js";
import { JA_STATE,resetLinkedInState } from "../../../core/state.js";
//# Linkedin needs for complete job details,job meta  and for job description.
function liDetailRoot() {
  return document.querySelector('.jobs-search__job-details--container')
      || document.querySelector('.jobs-details__main-content')
      || document.querySelector('#main')
      || null;
} 
function metaLiDetailRoot(){
  return document.querySelector('job-details-jobs-unified-top-card__container--two-pane') || document.querySelector('.jobs-search__job-details--container') || null;
}
function jdLiDetailRoot() {
  return (
    document.querySelector('.job-details-about-the-job-module__description') ||
    document.querySelector('.jobs-search__job-details--container') ||
    null
  );
}
function isNegativeLinkedInPage() {
  if (!isLinkedInHost()) return false;
  const p = location.pathname.toLowerCase();
  return LI_NEGATIVE_PATH.some(rx => rx.test(p));
}
function getBgImageUrl(el) {
  if (!el) return '';
  const s = getComputedStyle(el);
  const bg = s.backgroundImage || s['background-image'] || '';
  const m = bg.match(/url\(["']?(.+?)["']?\)/i);
  return m ? m[1] : '';
}
/* =========================
   6) Stable Job Key for LinkedIn
   ========================= */

async function computeStableJobKey() {
  // Prefer canonical URL from background (contains vendor IDs when available)
  try {
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'canonicalizeUrl', url: location.href }, resolve);
    });
    const canonical = resp?.canonical || location.href;
    if (canonical) return canonical; // use canonical URL as the job key
  } catch {}
}

function getLinkedInLogoUrl() {
  const scope = metaLiDetailRoot() || document;
  const img1 = scope.querySelector('img.jobs-unified-top-card__company-logo-image'); if (img1?.src) return absUrl(img1.src);
  const img2 = scope.querySelector('.jobs-unified-top-card__company-logo img');     if (img2?.src) return absUrl(img2.src);
  const bg1  = scope.querySelector('.jobs-unified-top-card__company-logo, .jobs-company__company-logo');
  const bgUrl1 = getBgImageUrl(bg1); if (bgUrl1) return absUrl(bgUrl1);
  const img3 = scope.querySelector('.artdeco-entity-image__image, .artdeco-entity-image img, img.ivm-view-attr__img--centered'); if (img3?.src) return absUrl(img3.src);
  const bg2  = scope.querySelector('.artdeco-entity-image__image');
  const bgUrl2 = getBgImageUrl(bg2); if (bgUrl2) return absUrl(bgUrl2);
  const listItem = document.querySelector('li.jobs-search-results__list-item[aria-selected="true"], li.jobs-search-results__list-item--active');
  const liImg = listItem?.querySelector('img'); if (liImg?.src) return absUrl(liImg.src);
  const liBg  = listItem?.querySelector('.artdeco-entity-image, .ivm-image-view-model__img');
  const liBgUrl = getBgImageUrl(liBg); if (liBgUrl) return absUrl(liBgUrl);
  return '';
}
function expandLinkedInDescription() {
  
  ['.show-more-less-html__button','button[aria-expanded="false"][data-control-name*="show"]',
   'button[aria-label*="show more" i]','button[aria-label*="see more" i]']
   .forEach(sel => document.querySelectorAll(sel).forEach(btn => { if (isVisible(btn)) { try { btn.click(); } catch {} } }));
}

/* =========================
   5) LinkedIn active-card helpers
   ========================= */
// try to get an id from html structure of Linkedin present page
function findLinkedInJobIdFromDetail() {
  const a = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]')).find(x => /\/jobs\/view\/\d+/.test(x.getAttribute('href')||''));
  const m = a?.getAttribute('href')?.match(/\/jobs\/view\/(\d+)/);
  if (m) return m[1];

  const el = document.querySelector('[data-job-id],[data-job-id-view],[data-job-id-saved]');
  const id = el?.getAttribute('data-job-id') || el?.getAttribute('data-job-id-view') || el?.getAttribute('data-job-id-saved');
  return id || '';
}
//tries to get an active id from active card, if not from url, if not from html.
function getActiveCardId() {
  const liActive =
    document.querySelector(
      'li.jobs-search-results__list-item--active [data-occludable-job-id], ' +
      'li.jobs-search-results__list-item[aria-selected="true"] [data-occludable-job-id], ' +
      ' .jobs-search-two-pane__job-card-container--active [data-occludable-job-id]'
    ) || document.querySelector('[data-occludable-job-id]');
  if (liActive?.dataset?.occludableJobId) return `LI:${liActive.dataset.occludableJobId}`;

  //const urlJobId = new URL(location.href).searchParams.get('currentJobId');
  const urlJobId = (safeURL(location.href)?.searchParams || new URLSearchParams()).get('currentJobId');
  if (urlJobId) return `LI:${urlJobId}`;

  const detailId = findLinkedInJobIdFromDetail();
  if (detailId) return `LI:${detailId}`;

  return '';
}

function getLinkedInActiveCardMeta() {
  if (!isLinkedInHost()) return null;
  //const root = metaLiDetailRoot() || document;
  const tEl = findJobTitleEl();
  const title = (tEl?.textContent || '').trim();
  if (!title) return null;
  function getLinkedInCompanyName() {
    // LinkedIn job details live in a dedicated container; prefer that as root
    /*
    const scope =
      root.querySelector('.jobs-search__job-details--container') ||
      root.querySelector('.jobs-details__main-content') ||
      root.querySelector('#main') ||
      root;
    */
    const scope = metaLiDetailRoot();
    // 1) Exact structure you shared
    let el = scope.querySelector('.job-details-jobs-unified-top-card__company-name a');
    if (el && el.textContent.trim()) {return el.textContent.trim();}
    // 2) Same container, but sometimes people grab the div instead of the <a>
    el = scope.querySelector('.job-details-jobs-unified-top-card__company-name');
    if (el && el.textContent.trim()) return el.textContent.trim();
    // 3) Other stable LinkedIn selectors we see in the wild
    const sels = [
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.top-card-layout__entity-info a',
      '.topcard__org-name-link',
      'a[data-test-app-aware-link][href*="/company/"]'
    ];
    for (const s of sels) {
      const n = scope.querySelector(s);
      if (n && n.textContent && n.textContent.trim()) return n.textContent.trim();
    }

    // 4) Fallback: look for the first company link in the unified top card region
    const region =
      scope.querySelector('.jobs-unified-top-card') ||
      scope.querySelector('.jobs-details__main-content') ||
      scope;
    const link = Array.from(region.querySelectorAll('a'))
      .find(a => /\/company\//.test(a.getAttribute('href') || ''));
    if (link && link.textContent.trim()) return link.textContent.trim();

    return '';
  }

  const  companyName = getLinkedInCompanyName();
 //console.log('company Name:', companyName);
  function getLinkedInLocation(root = document) {
    // container with multiple classes → dot-chain them
    const container = root.querySelector(
      '.t-black--light.mt2.job-details-jobs-unified-top-card__tertiary-description-container'
    );

    if (container) {
      // Prefer the first low-emphasis text chunk (that’s the location)
      const spans = container.querySelectorAll('span.tvm__text.tvm__text--low-emphasis');
      for (const sp of spans) {
        const text = sp.textContent?.trim();
        if (!text) continue;
        // Skip bullet separators or notes
        if (text === '·') continue;
        if (/responses managed off linkedin/i.test(text)) continue;
        return text;
      }

      // Fallback: take everything before the first bullet
      const raw = container.textContent.replace(/\s+/g, ' ').trim();
      const beforeBullet = raw.split('·')[0].trim();
      if (beforeBullet) return beforeBullet;
    }

    // Other LinkedIn layouts (fallbacks you already had)
    const fallbacks = [
      '.jobs-unified-top-card__primary-description',
      '.jobs-unified-top-card__job-insight .jobs-unified-top-card__bullet',
      '.top-card-layout__second-subline .jobs-unified-top-card__bullet',
    ];
    for (const s of fallbacks) {
      const v = root.querySelector(s)?.textContent?.trim();
      if (v) return v.split('·')[0].trim();
    }

    return '';
  }
  const locationText = getLinkedInLocation();
  //const u = new URL(window.location.href);
  const u = safeURL(window.location.href) || { hostname: location.hostname, pathname: location.pathname, origin: location.origin };
  let jobId = u.searchParams.get('currentJobId') || '';
  if (!jobId) {
    const selected = document.querySelector('.jobs-search-results__list-item[aria-selected="true"]');
    jobId = selected?.getAttribute('data-id')
         || selected?.getAttribute('data-occludable-job-id')
         || selected?.querySelector('[data-job-id]')?.getAttribute('data-job-id')
         || findLinkedInJobIdFromDetail()
         || '';
  }

  const canonicalUrl =  location.href; //jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` :
  const logoUrl = getLinkedInLogoUrl();
  const meta = { title, company: companyName, location: locationText, logoUrl, url: canonicalUrl, jobId, atsVendor: 'linkedin' };
  JA_STATE.lastActiveLIMeta = meta;
  return meta;
}

// Exports
export {
  liDetailRoot, metaLiDetailRoot, jdLiDetailRoot, isNegativeLinkedInPage, computeStableJobKey,
  getLinkedInLogoUrl, expandLinkedInDescription, findLinkedInJobIdFromDetail, getActiveCardId,
  getLinkedInActiveCardMeta,getBgImageUrl
};