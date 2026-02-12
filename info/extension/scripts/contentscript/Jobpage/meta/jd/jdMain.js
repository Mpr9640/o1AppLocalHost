import { hash, sanitize, waitForDomStable } from "../../../core/utils.js";
import {
  isWorkdayHost,
  isMetaHost,
  isWorkableHost,
  isIndeedHost,
  isEyHost,
  isGlassDoorHost,
  isTaleoHost //as _isTaleoHost
} from "../../../core/hosts.js";

import { detectJobPage } from "../../detection.js";
import { looksLikeAuthOrStepper } from "../../findingHelpers.js";

import { liDetailRoot } from "../linkedin/linkedIn.js";
import { findJobTitleEl } from "../jobtitle/jobTitle.js";

import { collectJDFromJSONLD } from "./jsonld/jsonldMain.js";
import { collectJDBySelectors } from "./jdSelectors.js";
import { collectJDByHeadings } from "./jdbyHeadings.js";
import { cleanJDText, stripLabelishLines, scoreJDText } from "./jdHelpers.js";


//Function to merger job description if it was splitted into different heading blocks
function mergeCandidateTexts(cands, maxLen = 24000) {
  const seen = new Set(); const parts = []; let total = 0;
  for (const c of cands) {
    const t = (c.text || '').trim(); if (t.length < 120) continue;
    const h = hash(t.toLowerCase()); if (seen.has(h)) continue;
    if (total + t.length > maxLen) {
      const slice = t.slice(0, Math.max(0, maxLen - total));
      if (slice.length >= 120) { parts.push(slice); total += slice.length; }
      break;
    }
    parts.push(t); total += t.length; seen.add(h);
    // Optional increase: allow a couple more chunks
    if (parts.length >= 8) break;
  }
  return parts.join('\n\n');
}

// Extracting complete info from page if the jd is unable to extracct from 
function extractPageTextSansForms() {
  try {
    const root = isLinkedInHost() ? (liDetailRoot() || document.body) : document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('form, fieldset, [role="form"], .application-form, nav, header, footer, aside, script, style').forEach(n => n.remove());
    clone.querySelectorAll('input, select, textarea, button').forEach(n => n.remove());
    const raw = sanitize(clone.innerText || clone.textContent || ''); const base = isLinkedInHost() ? raw : stripLabelishLines(raw);
    return cleanJDText(base);
  } catch { return ""; }
}

// Main core function for extracting job description

async function getJobDescriptionText(det = null) {
  //For Taleo host , we are skipping all the prechecks to extract jd from page.
  if(isTaleoHost && window.location.pathname.includes('jobdetail')){
    text = document.body.innerText;
    console.log('THe text is for taleo',text);
    return { text: text, anchor: document.body, source: 'jsonld' };
  }

  if (!ROLE_PARSE) return { text: "", anchor: null, source: "none" };
  // early bailout in top window
  /*
  if (IS_TOP_WINDOW && pageHasAtsIframe() && (!isGreenhouseHost ) ) {
    return { text: "", anchor: null, source: "skipped_ats_iframe" };
  }
  */
  // We are either inside the iframe, or on a page without an ATS iframe.
  // If you want to start *after* the JD block renders, add a tiny stabilizer:
  await waitForDomStable({ timeoutMs: 2500, quietMs: 180 });
  // ✅ reuse det if provided, otherwise detect once
  let pageDet = det;
  if (!pageDet) {
    try {
      pageDet = await detectJobPage();
    } catch {
      pageDet = null;
    }
  }

  if (pageDet && pageDet.allowUI === false) {
    return { text: "", anchor: null, source: "none" };
  } 
 
  // Do not return JD on auth/stepper/confirmation pages
  if (looksLikeAuthOrStepper()) return { text: "", anchor: null, source: 'none' };

  //Here we are avoidign schema for workday, because it is treating first job jd as for all jobs in a list.
  //we are skipping  meta from schema because it is extracting incomplete.
  if(!isWorkdayHost() && !isMetaHost()){
    // Stage 1: Schema.org JSON-LD (gold)
    const jsonld = collectJDFromJSONLD();
    if (jsonld.length) {
      const merged = mergeCandidateTexts(jsonld, 24000);
      //console.log("1.in cs the jd from jsonld",merged);
      if (merged && merged.length > 120) { 
        console.log('The jd found using jsonschema:', merged); 
        return { text: merged, anchor: document.body, source: 'jsonld' };
      }
    } 

  }

  //For workable we are not allowing selectos because it is not extracting all text.
  if(!isWorkableHost()){
    // Stage 2: Semantic DOM (selectors + headings)
    // Stage 2: DOM (selectors first; on Indeed skip headings if selectors already succeed)
    const selCands = collectJDBySelectors();
    selCands.forEach(c => c.score = scoreJDText(c.text));
    const selGood = selCands.filter(c => c.score >= 5);

    let candidates = selCands;

    // we are avoiding heading selection for indeed because of duplicate text
    if (isIndeedHost()||isEyHost()||isGlassDoorHost()) {
      // If selectors already found a solid JD, do NOT run headings (prevents duplicates)
      if (!selGood.length) {
        candidates = [...selCands, ...collectJDByHeadings()];
      }
    } else {
      // Non-Indeed: keep existing behavior
      candidates = [...selCands, ...collectJDByHeadings()];
    }
    //let candidates = [...collectJDBySelectors(), ...collectJDByHeadings()]; //
    if (candidates.length) {
      candidates.forEach(c => c.score = scoreJDText(c.text));
      //console.log('2.In cs the jd text we are extracting',candidates);
      let good = candidates.filter(c => c.score >= 5);
      //console.log("3. In cs the jd text",good);
    /*
    // Optional ML ranking (background can decide)
      const titleEl = findJobTitleEl();
      const detailsOk = !!(titleEl || getCompanyName() || getLocationText());
      if (detailsOk && good.length) {
        try {
          const items = (good || []).map(g => (g.text || '').slice(0, 1200));
          if (items.length) {
            const payload = { action: 'rankJDCandidates', items };
            const resp = await new Promise((resolve) => {
              let done = false;
              const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 3500);
              chrome.runtime.sendMessage(payload, (r) => {
                if (done) return;
                clearTimeout(timer);
                done = true;
                resolve(r || null);
              });
            });

            if (resp?.ok === true && Number.isInteger(resp.bestIndex) && good[resp.bestIndex]) {
              good = [ good[resp.bestIndex], ...good.filter((_, i) => i !== resp.bestIndex) ];
            }
          }
        } catch {}

      } */
      if (good.length) {
        const anchorFrom = good[0].el || titleEl || null;
        let anchor = anchorFrom;
        if (anchor) { for (let i=0; i<2 && anchor.parentElement; i++) {
          const p = anchor.parentElement;if (/SECTION|FORM|UL|LI|FIELDSET|ARTICLE|DIV/i.test(p.tagName)) anchor = p; else break;
          //anchor = p;
        } }
        const merged = mergeCandidateTexts(good, 24000);
        if (merged && merged.length > 120) {
          console.log('Description by selector and headings:', merged) ;
          return { text: merged, anchor: anchor || null, source: 'dom' };
        }
      }
    }

  }
  
  //For workable we are allowing to extract complete page text because it is selecting only some text with selectors.
  if(isWorkableHost()){
    // Stage 3: Keyword/context fallback
    const fallback = extractPageTextSansForms();
    if (fallback && fallback.length > 300){
      console.log('Stage 3 fallback for jd:',fallback);
      return { text: fallback, anchor: findJobTitleEl() || null, source: 'fallback' };
    };
  }
  return { text: "", anchor: null, source: 'none' };
}

// Exports
export { mergeCandidateTexts, extractPageTextSansForms, getJobDescriptionText };
