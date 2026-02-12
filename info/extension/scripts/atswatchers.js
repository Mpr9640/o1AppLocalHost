//NOTES: using submission detect action when the page was a successful page.
/**
 * scripts/atsWatchers.js  — main entry point
 *
 * Bootstraps the ATS success-page watcher by wiring together:
 *
 *   atswatchers/
 *   ├── core/
 *   │   ├── utils.js            ← DOM helpers, URL utilities
 *   │   └── messaging.js        ← chrome.runtime background messaging
 *   ├── detection/
 *   │   ├── signals.js          ← regex patterns, selectors, thresholds
 *   │   └── detector.js         ← looksLikeSuccessPage()
 *   ├── metadata/
 *   │   ├── sanitizer.js        ← title sanitization
 *   │   └── enricher.js         ← context enrichment & cache
 *   └── reporting/
 *       ├── idempotence.js      ← once-per-job guard
 *       ├── submissionCard.js   ← floating UI notification
 *       ├── reporter.js         ← reportSuccess() orchestration
 *       └── observers.js        ← SPA hooks, MutationObserver, scheduling
 */
import {
  scheduleCheck,
  patchHistory,
  startMutationObserver,
  bindInitialEvents
} from './atswatchers/reporting/observers.js';

(function () {
  // Idempotence guard — only initialize once per page
  if (window.__JobAidATSWatchers__) return;
  window.__JobAidATSWatchers__ = true;

  // Wire up SPA navigation interception
  patchHistory();

  // Start observing DOM mutations
  startMutationObserver();

  // Bind load / DOMContentLoaded listeners
  bindInitialEvents();

  // Hook so content-script can ping after icon mount
  window.initATSWatchers = function initATSWatchers() {
    scheduleCheck();
  };
})();