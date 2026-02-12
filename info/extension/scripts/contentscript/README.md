
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












