
scripts/
├── contentscript/
│   ├── core/
│   │   ├── hosts.js
│   │   └── utils.js
│   │   ├── state.js
│   ├── icon/
│   │   ├── menu/
│   │   │   ├── applied.js
│   │   │   └── menuCreating.js
│   │   ├── position.js
│   │   ├── showIcon.js
│   │   └── teardownUi.js
│   ├── jobcontext/
│   │   └── jobContext.js
│   ├── Jobpage/
│   │   ├── meta/
│   │   │   ├── generichostslists/
│   │   │   │   └── genericHostsLists.js
│   │   │   ├── jd/
│   │   │   │   ├── jsonld/
│   │   │   │   │   ├── jsonldHelpers.js
│   │   │   │   │   └── jsonldMain.js
│   │   │   │   ├── jdbyHeadings.js
│   │   │   │   ├── jdDisplaying.js
│   │   │   │   ├── jdHelpers.js
│   │   │   │   ├── jdMain.js
│   │   │   │   └── jdSelectors.js
│   │   │   ├── jobcompany/
│   │   │   │   └── jobCompanyMain.js
│   │   │   ├── jobicon/
│   │   │   │   └── jobIconMain.js
│   │   │   ├── joblocation/
│   │   │   │   └── jobLocationMain.js
│   │   │   ├── jobtitle/
│   │   │   │   └── jobTitle.js
│   │   │   └── linkedin/
│   │   │       └── linkedIn.js
│   │   ├── primaryjobblock/
│   │   │   ├── genericHosts.js
│   │   │   └── icims.js
│   │   ├── detection.js
│   │   └── findingHelpers.js
│   ├── reAutofill.js
│   └── scanandRunDetection.js
└── contentscript.js

hosts.js:  
export {
  ATS_HOST_MAP, KNOWN_JOB_HOSTS, NEGATIVE_HOSTS, HARD_BLOCK_HOSTS, SEARCH_ENGINE_HOSTS, LI_NEGATIVE_PATH,
  isGreenhouseHost, isAshbyHost, isIcimsHost, isTaleoHost, isIndeedHost, isWorkdayHost, isWorkableHost,
  isJobsViteHost, isEyHost, isMetaHost, isGlassDoorHost,
  hostMatches, isSearchEngineHost, isKnownJobHost, isAtsHost, isLinkedInHost,
  isNegativeHost, isHardBlockedHost
};
utils.js: 
export {
  isVisible, waitForDomStable, clamp, txt, sanitize, safeURL, absUrl, hash, debounce,
  closestToViewportCenter, sendBg};
state.js: JA_STATE,resetContentState,resetLinkedInState,resetGenericMetaState,resetAllState,resetDetection
applied.js: 
export {
  showJobAppliedToast, ensureAppliedBadge, syncAppliedBadgePosition, setAppliedBadgeVisible,
  updateAppliedUI, maybeRefreshApplied,
  __jobAidAppliedBadge, __jobAidAppliedAt, __JA_lastAppliedCanonical
};
menuCreating.js: export { AUTOFIL_ICON_URL, HOME_ICON_URL, createMenuItem, createRoad };

position.js: export { IS_TOP_WINDOW, pageHasAtsIframe, ROLE_UI, ROLE_PARSE };
showIcon.js: export { __ja_lastUIReqAt, __ja_rateLimit, requestShowIcon, showIcon };
teardownUi.js: export { teardownJobAidUI, requestRemoveIcon };

jobContext.js: export { initApplyClickMonitor, canonicalScore, hasTitleCompanyLocation, bindPageToJourney, pushJobContext };

genericHostsLists.js: export { extractMetaFromCard, getGenericActiveCardMeta, bindGenericListClicks};

jsonldHelpers.js: export { normalizeType, isJobPostingType, flattenJsonLd, htmlToText };
jsonldMain.js: export { findJobPostingsFromJSONLD, collectJDFromJSONLD, readJSONLDJob,jsonldHasJobPosting };

jdbyHeadings.js: export { isHeadingCandidate, collectJDByHeadings };
jdDisplaying.js: export { displayMatchingPerecentage };
jdHelpers.js: export { cleanJDText, stripLabelishLines, scoreJDText };
jdMain.js: export { mergeCandidateTexts, extractPageTextSansForms, getJobDescriptionText };
jdSelectors.js: export { HEADING_RE, JD_SELECTORS, hasJDContainers, collectJDBySelectors };
jobCompanyMain.js: export { getCompanyName };
jobIconMain.js: export { bestIcon, getCompanyLogoUrl };
jobLocationMain.js: export { getLocationText };
jobTitle.js: export { findJobTitleEl, titleLooksSane, getJobTitleStrict };
linkedIn.js: export {
  liDetailRoot, metaLiDetailRoot, jdLiDetailRoot, isNegativeLinkedInPage, computeStableJobKey,
  getLinkedInLogoUrl, expandLinkedInDescription, findLinkedInJobIdFromDetail, getActiveCardId,
  getLinkedInActiveCardMeta,getBgImageUrl
};
genericHosts.js: export { findGenericJobListContainers, findGenericJobCards, isSelectedCard, };
icims.js: export { selectPrimaryJobBlock };
detection.js: export { detectJobPage };
findingHelpers.js: export { URL_KEYWORDS, urlHints, looksLikeGrid, hasApplySignals, looksLikeAuthOrStepper };
reAutofill.js: export {initAutofillReentry};
scanandRunDetection.js: export { __JA_lastUrl, scan, runDetectionNow};
contentscript.js: export {
  __JA_FRAME_ID, __JA_LOCK_KEY, pauseDetections, shouldPauseDetections,
  refreshAutofillStateOnce, runDetection,allSkills
};

overview:
1. finding the job page, extracting the jd(text) and sending that text to bakground, background making api call, if response was received using that response, otherwise doing offline skill matching.
checkings: url verification making keeping the banner for same url matching and hashing the jd,chekcing the hashed jd to avoid extracting again the same text doing other process.
2. After jd, if it is a **linkedin** than it is finding the active job card and sending that job card to backend with an action **liactivejobcard**, backend saving that **meta** in **liactivemetabytab**
3. For all hosts, we are pushing the data into **jobctxBytab**.
4.Here after finding meta, we are sending **updatejobcontext** action with meta , url ,confidence to background and background is saving that data in **jobctxByTab** map. 
5. in **jobctxByTab**, we are using **first_canonical** as either the first seen url or canonical, because first seen will be only comes after the user clicks on apply, at that time we are taking that url as first url.
6.When the apply click was happend than we are sending a message to background with ac action **journeystart** and it is getting the meta need from jobctxbytab and saving that data into journeytab with **ajid**. const journeysByTab = new Map(); // tabId -> { activeAjid, items: Map<ajid, Journey> }
7. After that we are pushing that in to **canonical** where it saves complete meta as, 
  url: snap.url,
  title: norm(snap.title) || 'Unknown',
  company: norm(snap.company) || '',
  location: norm(snap.location) || '',
  logo_url: snap.logoUrl || null,
  started_at: Date.now(),
  ajid: ajid || null,
  submitted_at:
8. Jjourneys by tab will hold all the journeys happend for that particular tab, it will auto run when page refresh or push state/ replace state. I mean back and next. items hold, ajid and snap,..

9.

**Popupcard**:
1. In popup, it is making a request to send a jobctx for present tab id, the background looking for **jobctxbytab** and returing the data in that map.
**const jobCtxByTab = new Map(); // tabId -> { canonical, first_canonical, meta, updated_at, confidence }**


issues to fix in the morning.
1. Need to check the applied url for every 3 secs.
2. in popup, canonical page detection is going wrong. Need to update with solution like in contentcript when detection was trure tha we can set on what based it was set like on jd(we will treat as start page) and show the regular page data otherwise page hourney data. 
3. In detectiong, we are not taking scoring of jd for allowUI.
4. first canonical url will not set until he clicks on apply, we are taking this reference to showcard in popup.
5.in popup finding the present page details is being good. but show card is being set to false where unable to show card.








