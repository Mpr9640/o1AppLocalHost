
import { ATS_HOST_MAP, isGreenhouseHost, isJobsViteHost } from "../core/hosts.js";
//# starting: Code we are using for top window to display an icon and description
// ---- Frame role split (works on all hosts) ----
const IS_TOP_WINDOW = (window.top === window.self);
// Does this page embed an ATS/vendor iframe?
function pageHasAtsIframe() {
  try {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    if (!iframes.length) return false;
    const rx = new RegExp(ATS_HOST_MAP.map(r => r.source).join('|'), 'i');
    return iframes.some(fr => {
      const src = fr.src || fr.getAttribute('data-src') || '';
      return rx.test(src || '');
    });
  } catch (e) {
    console.warn('[iframe-detect] error', e);
    return false;
  }
}
// Role assignment:
// - UI (icon/banner triggers) only on top window
// - Parsing (JD, skills, forms) inside ATS iframe when present; orwise fallback to top
//skipping jobsvite host for roleparse because the top page has content eventhough iframes exist.
const ROLE_UI = IS_TOP_WINDOW;
const ROLE_PARSE =(pageHasAtsIframe() && (!isGreenhouseHost) && (!isJobsViteHost()))? !IS_TOP_WINDOW : true;

// Exports
export { IS_TOP_WINDOW, pageHasAtsIframe, ROLE_UI, ROLE_PARSE };