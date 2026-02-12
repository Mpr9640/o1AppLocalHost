import { hash } from "./core/utils.js";
import { isGlassDoorHost, isLinkedInHost } from "./core/hosts.js";

import { detectJobPage } from "./Jobpage/detection.js";
import { getJobDescriptionText } from "./Jobpage/meta/jd/jdMain.js";

import { computeStableJobKey, getLinkedInActiveCardMeta } from "./Jobpage/meta/linkedin/linkedIn.js";
import { bindGenericListClicks, getGenericActiveCardMeta } from "./Jobpage/meta/generichostslists/genericHostsLists.js";

import { getJobTitleStrict } from "./Jobpage/meta/jobtitle/jobTitle.js";
import { getCompanyName } from "./Jobpage/meta/jobcompany/jobCompanyMain.js";
import { getLocationText } from "./Jobpage/meta/joblocation/jobLocationMain.js";
import { getCompanyLogoUrl } from "./Jobpage/meta/jobicon/jobIconMain.js";

import { requestShowIcon } from "./icon/showIcon.js";
import { maybeRefreshApplied } from "./icon/menu/applied.js";
import { teardownJobAidUI } from "./icon/teardownUi.js";



// if removeBanner/removeIcon live in icon modules, import them from there
import { requestRemoveIcon } from "./icon/teardownUi.js";

import { JA_STATE, resetContentState } from "./core/state.js";



/* =========================
   7) Scan loop (ties together job page detection + icon UI + JD send)
   ========================= */
// ====== Core scan (trusts the strict gate; does NOT re-detect) ======
async function scan(det) {
  // compute stable job key once per page/job
  const newKey = await computeStableJobKey();
  if (newKey && newKey !== JA_STATE.currentJobKey) {
    JA_STATE.currentJobKey = newKey;
    //lastJDHash = ""; matchedWords = []; allSkills = [];
    resetContentState();
    removeBanner();
  }

  // Icon state
  if (det.allowUI && !JA_STATE.jobApplicationDetected) {
    //showIcon();
    requestShowIcon(det);
    JA_STATE.jobApplicationDetected = true;
  }
  else if(det.allowUI) {
    // optional: keep it silent; your log currently spams
    // console.log('Icon was displayed already');
  }
  if (!det.allowUI) {
    requestRemoveIcon();
  }
  await maybeRefreshApplied();
  // NO need to Expand collapsed descriptions on sites like LinkedIn
  //expandLinkedInDescription();
  

  // JD extraction (guarded)
  if (!ROLE_PARSE) return { text: "", anchor: null, source: "none" };

  /*
  // If ATS iframe exists, prefer parsing inside iframe (except Greenhouse)
  if (IS_TOP_WINDOW && pageHasAtsIframe() && !isGreenhouseHost) {   // && !isa
    return { text: "", anchor: null, source: "skipped_ats_iframe" };
  }
  */
  const urlKey = location.href.split('#')[0];
  //We are skipping url check for glassdoor because , eventhough the job was changed, the url is being same.
  if (isGlassDoorHost() || !JA_STATE._didFullJDForUrl.has(urlKey)) {
    console.log('In scan we are going to call job descripton');
    const { text, anchor, source } = await getJobDescriptionText(det);
    if (text && text.length > 120) {
      console.log('Entered in to the inside to send jd to the background')
      JA_STATE._didFullJDForUrl.add(urlKey);
      JA_STATE.jdAnchorEl = anchor || null;
      const h = hash(text);
      console.log('hashing',h===JA_STATE.lastJDHash);
      if (h !== JA_STATE.lastJDHash) {
        JA_STATE.lastJDHash = h;
        console.log('The jd sending to background is:',text);
        chrome.runtime.sendMessage({ action: "jdText", text, jobKey: JA_STATE.currentJobKey, source, tier: det.tier });
      }
    }
  }

  // Push sticky job context for popup/background
  if (isLinkedInHost()) {
    const liMeta = getLinkedInActiveCardMeta();
    if (liMeta && (liMeta.title || liMeta.company)) {
      chrome.runtime.sendMessage({ action: 'liActiveJobCard', jobKey: JA_STATE.currentJobKey, meta: liMeta });
      pushJobContext({ ...liMeta, jobKey: JA_STATE.currentJobKey }, { confidence: det.tier === 'high' ? 1.0 : 0.7 });
    }
  } else {
    bindGenericListClicks();
    const generic = getGenericActiveCardMeta();
    const meta = generic && (generic.title || generic.company)
      ? { ...generic, jobKey: JA_STATE.currentJobKey }
      : {
          title: getJobTitleStrict(),
          company: getCompanyName(),
          location: getLocationText(),
          logoUrl: getCompanyLogoUrl(),
          url: location.href,
          jobKey: JA_STATE.currentJobKey
        };
    pushJobContext(meta, { confidence: det.tier === 'high' ? 1.0 : 0.7 });
  }
}
// ====== Unified strict gate + observers (single install) ======
let __JA_lastUrl = location.href;

// Non-debounced core gate
async function runDetectionNow() {
  try {
    const det = await detectJobPage(); // single detection pass
    console.log('In run detection after detection:',det);
    const curUrl = location.href;
    console.log('In rundet the current location:',curUrl);
    console.log('In rundet the ja location:',__JA_lastUrl); 
    if (curUrl !==__JA_lastUrl) {
      teardownJobAidUI("url_changed");
    }

    // Strict UI gate & teardown
    if (!det.allowUI || (det.tier !== 'medium' && det.tier !== 'high')) {
      //jobApplicationDetected = false;
      //removeIcon();
      //removeBanner();
      //currentJobKey = ""; lastJDHash = ""; lastActiveLIMeta = null;
      teardownJobAidUI("detector_disallowed");
      return;
    }
    console.log('We are passed in rundetection, sending to scan func ');
    // If URL hasn't changed and the tab is in background, you can early return (optional).
    // const cur = location.href;
    // if (document.hidden && cur === __JA_lastUrl) return;
    __JA_lastUrl = location.href;

    await scan(det); // pass detection result down (no re-detection)
  } catch {}
}

// Exports
export { __JA_lastUrl, scan, runDetectionNow};
