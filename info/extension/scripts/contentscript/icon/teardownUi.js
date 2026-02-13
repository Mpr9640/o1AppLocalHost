import { IS_TOP_WINDOW } from "./position.js";
import { __ja_rateLimit } from "./showIcon.js";
import { JA_STATE,resetAllState } from "../core/state.js";


// Using to remove icon and Job description block in a job page,when the url was changes(works on spa pages also)
function teardownJobAidUI(reason = "unknown") {
  try { JA_STATE.jobApplicationDetected = false; } catch {}

  // Remove main icon + menu (if your removeIcon doesn't remove menu, do it here too)
  try { removeIcon?.(); } catch {}
  try { document.getElementById('jobAidMenuContainer')?.remove(); } catch {}

  // Remove skills banner host (shadow DOM container)
  try { document.getElementById('jobAidSkillBannerHost')?.remove(); } catch {}

  // If you have other overlays/panels, remove them here similarly.

  // Reset all job/JD state so SPA routes don't reuse it
  /*
  try {
    jdAnchorEl = null;
    lastJDHash = "";
    matchedWords = [];
    percentage = 0;
    currentJobKey = "";
    lastActiveLIMeta = null;
    lastActiveGenericMeta = null;
    _didFullJDForUrl = new Set();  // important: per-route JD memory must reset
  } catch {}  */
  try{
    resetAllState();
  }
  catch{}

  // Optional: clear global refs used by other code paths
  try { window.__JobAidIconEl = null; } catch {}
  try { window.__JobAidIconShown = false; } catch {}
}

function requestRemoveIcon() {
  if (IS_TOP_WINDOW) {
    removeIcon?.();
    return;
  }

  if (!__ja_rateLimit(700)) return;

  try {
    chrome.runtime.sendMessage({ action: 'JA_REMOVE_ICON_TOP' });
  } catch {}
}

// Exports
export { teardownJobAidUI, requestRemoveIcon };
