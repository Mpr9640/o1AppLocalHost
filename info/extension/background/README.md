o1/
├── info/
│   └── extension/
│       ├── background/
│       │   ├── canonandapplied/
│       │   │   ├── appliedInstance.js
│       │   │   ├── canon.js
│       │   │   └── utils.js
│       │   ├── core/
│       │   │   └── utils.js
│       │   ├── frames/
│       │   │   └── iframeHandling.js
│       │   ├── jobjourney/
│       │   │   └── journeybyTab.js
│       │   ├── offscreen/
│       │   │   └── offscreenMain.js
│       │   └── taxonomy/
│       │       ├── refreshTaxonomy.js
│       │       ├── skillsExtraction.js
│       │       └── utils.js
                └── skillsApi.js(new)
│       ├── images/
│       ├── node_modules/
│       ├── offscreen/
│       ├── popup/
│       ├── scripts/
│       └── background.js

appliedInstance.js: export {
  rememberAppliedInstant,
  getInstantApplied,
  getTclMap,
  setTclMap,
  tclKey,
  rememberAppliedTcl,
  persistApplied
};
canon.js: export {
  canonicalStore,
  MAX_CANONICALS,
  canonicalJobUrl,
  canonLRU,
  canonicalJobUrlCached,
  pushCanonicalSnapshot,
  markCanonicalSubmitted,
  removeCanonical,
  getCanonicalSnapshot
};
canonandapplied/utils.js: 
export {
  scoreMeta,
  nonEmptyMerge
};
Core/utils.js: export {
  ATS_HOSTS_RX,
  PLATFORM_HOSTS_RX,
  isATS,
  isPLATFORM,
  isPlatform,
  norm,
  sanitizeTitle,
  timeout,
  safeHttpUrl
};
iframeHandling.js: export {
  newAjid,
  getAllFramesSafe,
  findPrimaryFrameId,
  sendToFrame,
  proxyToPrimaryFrame
};

journeybyTab.js: 
export {
  jobCtxByTab,
  journeysByTab,
  getBag,
  upsertJourney,
  updateCtx,
  preferCtxCanonical
};
offscreenMain.js: export {
  zeroShotDisabledUntil,
  zeroShotTimeoutsInRow,
  nerDisabledUntil,
  nerTimeoutsInRow,
  OFFSCREEN_URL,
  ensureOffscreen,
  waitForOffscreenReady,
  rebuildOffscreenIfStuck,
  callOffscreen,
  noteZSTimeout,
  noteZSSuccess,
  noteNERTimeout,
  noteNERSuccess
};
refreshTaxonomy.js: 
export {
  USE_REMOTE_TAXONOMY,
  maybeRefreshTaxonomy
};
skillsExtraction.js: 
export {
  extractSkillsHybrid
};
taxonomy/utils.js: export {
  PROPER_CASE,
  LEADING_GLUE,
  TRAILING_GLUE,
  stripGlue,
  normalizeFreeText,
  normalizeCoreSkill,
  dropGlueExpansions,
  postProcessSkills
};
background.js: export {
  API_BASE_URL,
  liActiveMetaByTab,
  autofillActiveByTab,
  fetchDataFromBackend,
  blobToDataURL,
  guessFilename,
  fetchResumeFile,
  hasSession,
  memSession,
  sessionSet,
  sessionGet,
  sessionRemove,
  sessionClear,
  apiClient
};






