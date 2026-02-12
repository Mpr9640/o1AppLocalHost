scripts/
├── atsWatchers.js                          ← main entry point
└── atswatchers/
    ├── core/
    │   ├── utils.js                        ← QS, attr, abs, favicon, nonEmptyMerge, isVisible
    │   └── messaging.js                    ← sendBg, getCtx, canonicalize, getMetadataFromCache
    ├── detection/
    │   ├── signals.js                      ← all regex patterns, selectors, thresholds
    │   └── detector.js                     ← looksLikeSuccessPage()
    ├── metadata/
    │   ├── sanitizer.js                    ← sanitizeTitle()
    │   └── enricher.js                     ← enrichWithStickyContext()
    └── reporting/
        ├── idempotence.js                  ← oncePerJob()
        ├── submissionCard.js               ← showSubmissionCard()
        ├── reporter.js                     ← reportSuccess()
        └── observers.js                    ← scheduleCheck, patchHistory, MutationObserver

scripts/
├── atsWatchers.js                      ← main entry
└── atswatchers/
    ├── core/
    │   ├── utils.js                    ← DOM helpers, URL utils
    │   └── messaging.js               ← sendBg, getCtx, canonicalize
    ├── detection/
    │   ├── signals.js                  ← regex, selectors, thresholds
    │   └── detector.js                 ← looksLikeSuccessPage
    ├── metadata/
    │   ├── sanitizer.js                ← sanitizeTitle
    │   └── enricher.js                 ← cache helpers, enrichWithStickyContext
    └── reporting/
        ├── idempotence.js              ← oncePerJob guard
        ├── submissionCard.js           ← UI card
        ├── reporter.js                 ← reportSuccess
        └── observers.js               ← SPA hooks, MutationObserver, scheduling