
import { normalizeName } from '../../utils.js';
import { clickLikeUser } from '../../populate/helpers.js';

//STEP1: Inputs extraction
// Check if element lives in a cookie/consent / OneTrust overlay
function isCookieOrConsentControl(el) {
  const id = (el.id || '').toLowerCase();
  const cls = (el.className || '').toString().toLowerCase();
  const name = (el.name || '').toLowerCase();

  // Common OneTrust / consent containers
  const inCookieContainer = !!el.closest(
    '#onetrust-banner-sdk, #onetrust-pc-sdk, #onetrust-consent-sdk, ' +
    '.ot-sdk-container, .ot-sdk-row, .onetrust-pc-dark-filter, ' +
    '[data-testid*="cookie"], [aria-label*="cookie"], [aria-label*="Cookie"]'
  );

  if (inCookieContainer) return true;

  // Heuristic: cookie/consent/tracking in id/class/name
  const blob = `${id} ${cls} ${name}`;
  if (/\bcookie\b|\bconsent\b|\btracking\b|\bprivacy\b/.test(blob)) {
    return true;
  }

  return false;
}

// Skip obvious non-form regions: navigation, header, footer, toolbars, menus
function isInNonFormChrome(el) {
  if (
    el.closest(
      'header, footer, nav, [role="banner"], [role="navigation"], ' +
      '[role="menubar"], [role="toolbar"], [data-testid*="toolbar"], ' +
      '[class*="toolbar"], [class*="nav"], [class*="navbar"]'
    )
  ) {
    return true;
  }
  return false;
}

// Additional "junk" patterns (site keepalive, recaptcha, etc.)
function isJunkInput(el) {
  const id = (el.id || '').toLowerCase();
  const cls = (el.className || '').toString().toLowerCase();

  // iCIMS / others: keep-alive, nav triggers, captcha
  if (
    id === 'keepmealivebutton' ||
    id === 'nav-trigger' ||
    cls.includes('recaptcha') ||
    id.startsWith('h-captcha-response') ||
    id.startsWith('g-recaptcha-response')
  ) {
    return true;
  }

  // OneTrust cookie toggles (shown in your sample)
  if (
    id.startsWith('ot-group-id-') ||
    cls.includes('category-switch-handler') ||
    id === 'chkbox-id' ||
    id.startsWith('select-all-')
  ) {
    if (el.closest('#onetrust-banner-sdk, #onetrust-pc-sdk, #onetrust-consent-sdk')) {
      return true;
    }
  }

  return false;
}

// Detect "Upload resume/CV" style button that is clearly a file trigger.
function isFileTriggerButton(btn) {
  if (!btn || btn.tagName !== 'BUTTON') return false;
  const text = (btn.textContent || '').toLowerCase().trim();

  if (!text) return false;
  // ✅ CHANGE: simpler regex, matches "select files", "select file", etc.
  if (!/upload|attach|choose file|select file|select files|browse|resume|cv/.test(text)) {
    return false;
  }
  // Look nearby for an <input type="file">
  const container = btn.closest('form, [role="form"], div, section') || btn.parentElement;
  if (!container) return false;

  const fileInput = container.querySelector('input[type="file"]');
  if (!fileInput) return false;

  return true;
}

// Toolbar-ish detection (refined)
function isToolbarish(el) {
  return !!el.closest(
    '[role="toolbar"], [role="menu"], header, ' +
    '[data-testid*="toolbar"], [class*="toolbar"], [class*="editor"], ' +
    '[contenteditable="true"][data-slate-editor="true"]'
  );
}

//Defining a new function for to expand all sections in succesfactors.eu   starting

function triggerExpandAllSections({ timeout = 3000 } = {}) {
  const start = Date.now();

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      // 1️⃣ Find candidate buttons
      const buttons = [...document.querySelectorAll('a[role="button"]')];

      const expandBtn = buttons.find(btn =>
        /expand all sections/i.test(btn.textContent || '') ||
        btn.classList.contains('expandCollapseTxt') ||
        btn.id?.includes('_expandAllSections')
      );

      if (expandBtn) {
        clearInterval(timer);

        // 2️⃣ Scroll into view (important for some frameworks)
        expandBtn.scrollIntoView({ behavior: 'instant', block: 'center' });

        // 3️⃣ Fire REAL user-like events
        clickLikeUser(expandBtn);

        console.log('[Autofill] Expand All Sections triggered');
        resolve(true);
      }

      if (Date.now() - start > timeout) {
        clearInterval(timer);
        console.warn('[Autofill] Expand All Sections not found');
        resolve(false);
      }
    }, 100);
  });
}
//  Used in inputSelection for Deduplicate only *consecutive* fields with the same humanName & no groupId
function filterConsecutiveDuplicates(fields) {
  const result = [];

  for (let i = 0; i < fields.length; i++) {
    const curr = fields[i];
    const prev = result[result.length - 1];

    if (
      !curr.groupId &&
      prev &&
      !prev.groupId &&
      normalizeName(prev.humanName) === normalizeName(curr.humanName)
    ) {
      continue;
    }

    result.push(curr);
  }

  return result;
}

export {
  isCookieOrConsentControl,
  isInNonFormChrome,
  isJunkInput,
  isFileTriggerButton,
  isToolbarish,
  triggerExpandAllSections,
  filterConsecutiveDuplicates
};
