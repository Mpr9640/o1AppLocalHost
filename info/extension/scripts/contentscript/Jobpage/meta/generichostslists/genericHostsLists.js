// core utils
import { absUrl, closestToViewportCenter /*, lastActiveGenericMeta */ } from "../../../core/utils.js";

// job meta extractors
import { findJobTitleEl } from "../jobtitle/jobTitle.js";
import { getLocationText } from "../joblocation/jobLocationMain.js";
import { getCompanyName } from "../jobcompany/jobCompanyMain.js";
import { getCompanyLogoUrl } from "../jobicon/jobIconMain.js";

import { JA_STATE,resetGenericMetaState } from "../../../core/state.js";
// generic list/card detection
import { findGenericJobCards, isSelectedCard } from "../../primaryjobblock/genericHosts.js";

function extractMetaFromCard(item, link) {
  //const heading = item.querySelector('h1,h2,h3,h4,[role="heading"]');
  const title = (findJobTitleEl()?.textContent || '').trim() //|| sanitize((link?.textContent || heading?.textContent || '').trim());
  //const locEl = item.querySelector('[data-test*="location" i], [data-testid*="location" i], .location, [class*="location" i]');
  const location = (getLocationText() || '').trim()//sanitize((locEl?.textContent || '').replace(/\s*[•·]\s*/g,' • ').trim());
  const company = getCompanyName();
  const img = item.querySelector('img[alt*="logo" i], .company-logo img, img');
  const logoUrl = img?.src ? absUrl(img.src) : getCompanyLogoUrl();
  //const url = absUrl(link?.href || '');
  const url = absUrl((link && typeof link.href === 'string') ? link.href : '');
  return { title, company, location, logoUrl, url };
}
function getGenericActiveCardMeta() {
  const cards = findGenericJobCards();
  if (cards.length === 0) return null;

  // 1) explicit selection
  let pick = cards.find(c => isSelectedCard(c.item));
  if (!pick) {
    // 2) focus inside the item (keyboard navigation)
    pick = cards.find(c => c.item.matches(':focus-within'));
  }
  if (!pick) {
    // 3) item nearest to viewport center (best-effort for two-pane layouts)
    const nodes = cards.map(c => c.item);
    const best = closestToViewportCenter(nodes);
    pick = cards.find(c => c.item === best) || null;
  }
  if (!pick) {
    // 4) only if the list is tiny, allow index 0 as a last resort
    if (cards.length <= 2) pick = cards[0];
  }
  if (!pick) return null;

  const meta = extractMetaFromCard(pick.item, pick.link);
  if (!(meta.title || meta.url)) return null;
  return { ...meta, atsVendor: 'company' };
}


function bindGenericListClicks() {
  if (window.__JobAidGenericListBound__) return;
  window.__JobAidGenericListBound__ = true;
  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href]');
    if (!a) return;
    const li = a.closest?.('[role="option"], [role="listitem"], li, .job-card, .posting, .position, .result');
    if (!li) return;
    setTimeout(() => {
      try {
        const meta = getGenericActiveCardMeta();
        if (meta && (meta.title || meta.company)) {
          chrome.runtime.sendMessage({ action: 'updateJobContext', canonical: location.href, meta, confidence: 0.75 });
          JA_STATE.lastActiveGenericMeta = meta;
        }
      } catch {}
    }, 120);
  }, { capture: true, passive: true });
}
// Exports
export { extractMetaFromCard, getGenericActiveCardMeta, bindGenericListClicks};
