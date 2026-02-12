import {
  isHardBlockedHost,
  isSearchEngineHost,
  isNegativeHost,
  isKnownJobHost,
  isAtsHost
} from "../core/hosts.js";

import { isNegativeLinkedInPage } from "./meta/linkedin/linkedIn.js";

import { jsonldHasJobPosting } from "./meta/jd/jsonld/jsonldMain.js";

import { findJobTitleEl, titleLooksSane } from "./meta/jobtitle/jobTitle.js";
import { getCompanyName } from "./meta/jobcompany/jobCompanyMain.js";
import { getLocationText } from "./meta/joblocation/jobLocationMain.js";

import { urlHints, looksLikeGrid, hasApplySignals } from "./findingHelpers.js";
import { hasJDContainers } from "./meta/jd/jdSelectors.js";
//# Detection (single pass, no duplicates)
async function detectJobPage() {
  // One-time early host/negative checks here (and ONLY here)
  if (isHardBlockedHost()) {
    return { ok: false, tier: 'none', score: 0, allowUI: false, signals: { reason: 'hard_block' } };
  }
  if (isSearchEngineHost() || isNegativeHost() || isNegativeLinkedInPage()) {
    return { ok: false, tier: 'none', score: 0, allowUI: false, signals: { reason: 'negative_host_or_path' } };
  }

  // Cache signals once; reuse for both booleans & scoring
  const schemaFound = jsonldHasJobPosting();
  const titleEl     = findJobTitleEl();
  const title       = (titleEl?.textContent || '').trim();
  const detailsOk   = titleLooksSane(title) || !!getCompanyName() || !!getLocationText();
  const urlHintsVal = urlHints();              // number
  const knownHost   = isKnownJobHost();        // boolean
  const hasApply    = hasApplySignals();       // boolean
  const hasJD       = hasJDContainers();       // boolean
  const ats         = isAtsHost();             // boolean

  console.log('Schema Found:',schemaFound);
  console.log('title:',title);
  console.log('detailsOk:',detailsOk);
  console.log('urlHintsVal:',urlHintsVal);
  console.log('knownHost:',knownHost);
  console.log("hasApply:",hasApply);
  console.log('hasJD:',hasJD);
  console.log('ats:',ats);

  const schemaScore = schemaFound ? 1.2 : 0;
  const hostScore   = knownHost   ? 0.8 : 0;
  const formScore   = hasApply    ? 0.8 : 0;
  const detailsScore= detailsOk   ? 0.6 : 0;
  const urlScore    = urlHintsVal > 0 ? 0.8 : 0;
  const atsScore    = ats ? 0.3 : 0;

  // Optional ML boost stays off; keep variable so code never crashes
  let mlBoost = 0;

  let score = urlScore + hostScore + atsScore + schemaScore + detailsScore + formScore + mlBoost;
  const s1 = !!schemaFound;
  const s2 = !!titleLooksSane(title);
  const s3 = !!knownHost;
  const s4 = !!hasApply;
  const s5 = !!hasJD;
  const s6 = urlHintsVal > 0;

  const strongSignals = [s1,s2,s3,s4,s5,s6].filter(Boolean).length;
  const gridOnly = looksLikeGrid(document) && strongSignals < 2;

  let tier = 'none', ok = false;

  if (schemaFound) { ok = true; score = Math.max(score, 2.6); tier = 'high'; }
  else if (!gridOnly && strongSignals >= 2 && score >= 1.6) { ok = true; tier = 'medium'; }
  else if (!gridOnly && (urlScore + hostScore + atsScore) >= 1.0 && (detailsOk || hasJD)) { ok = true; tier = 'low'; }

  const allowUI = ok
    && (tier === 'medium' || tier === 'high') 
    //&& (schemaFound || hasJD || hasApply || urlHintsVal);
    &&(schemaFound || hasJD ||(hasApply && detailsOk && (knownHost || ats)))

  const scoreNum = Number.isFinite(score) ? Number(score.toFixed(2)) : 0;

  return {
    ok, tier, score: scoreNum, allowUI,
    signals: {
      urlScore, hostScore, atsScore, schemaFound, detailsOk,
      formSignals: !!formScore, strongSignals, gridOnly, mlBoost
    }
  };
}

// Exports
export { detectJobPage };
