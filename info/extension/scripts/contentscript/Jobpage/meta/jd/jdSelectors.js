
import { isVisible, txt, sanitize } from "../../../core/utils.js";
import { isLinkedInHost } from "../../../core/hosts.js";
import { jdLiDetailRoot } from "../linkedin/linkedIn.js";
import { stripLabelishLines, cleanJDText } from "./jdHelpers.js";
//# code using for jd selection
const HEADING_RE = /(?:^|\b)(?:job\s*description|about\s*the\s*(role|job)|role\s*requirements|responsibilities|requirements|qualifications|skills|what\s+(?:you(?:’|')?ll|you\s+will)\s+do|you\s+are|what\s+we\s+look\s+for|preferred\s+qualifications|minimum\s+qualifications|(should|must)\s+have|nice\s+to\s+have|duties|scope)(?=\b|\s*[:—-])/i;

// for greenhouse: ".job__description.body",".job_description","[class*='job_description']",'.
//  Indeed:  '#jobDescriptionText'
// Linkedin: '.job-details-about-the-job-module__description','.jobs-search__job-details--container',  '.feed-shared-inline-show-more-text',
// ICIMS:   'table[role="presentation"] .editablesection','[id^="requisitionDescriptionInterface"] .editablesection',
// jobVite: '.jv-job-detail-description'
//Ey, '[itemprop="description"]', '.joblayouttoken', ".job_description",  
//meta,'x1ap80js'   
//Glassdoor, 'div[class^="JobDetails_jobDescription"]','div[data-brandviews*="joblisting-description"], .JobDetails_jobDescription';
//paylocity.com:  'div[class ^="listing_job-description"]',div[class ^= "listing_job-container"],div[class ^= "listing_btn-container"]
const JD_SELECTORS = [  
  'table[role="presentation"] .editablesection',
  'table[id = "gnewtonJobDescription"]', // FOr https://careers.twomenandatruck.com/
  '[id^="requisitionDescriptionInterface"] .editablesection',
  'div[class ^="listing_job-description"]','div[class ^= "listing_job-container"]','div[class ^= "listing_btn-container"]',  //Paylocity.com
  ".job__description.body",
  ".job__description body",
  ".job_description",
  '.job-details-about-the-job-module__description',
  '.feed-shared-inline-show-more-text',
  "[class*='job_description']",'.jobs-description__container','.jobs-box__html-content',
  '.jobs-description-content__text','.jobs-unified-description__content',
  '.show-more-less-html__markup',
  '#jobDescriptionText','.jobsearch-jobDescriptionText',
  '[data-automation-id="jobPostingDescription"]','[data-automation-id="richTextArea"]',
  '#job-details','[aria-labelledby = "job-overview"]','#overview',
  '#jobdescSec','[data-cy="jobDescription"]','section[data-testid="jobDescription"]',
  '.job-details__content',
  '.job-description','[itemprop="description"]','.unstyled-html',
  '#jobDescription','.jobDescription','.description__text',
  '#iCIMS_JobContent','.iCIMS_JobDescription','.posting .section-wrapper','.posting .content',
  '.posting .description','.jv-job-detail-description','x1ap80js','div[class^="JobDetails_jobDescription"]'//,'div[data-brandviews*="joblisting-description"]', '.JobDetails_jobDescription'
];
//checking wether the page has jd or not
function hasJDContainers() {
  const root = isLinkedInHost() ? (jdLiDetailRoot() || document) : document;
  return !!root.querySelector(JD_SELECTORS.join(','));
}

function collectJDBySelectors() {
  const arr = [];
  const root = isLinkedInHost() ? (jdLiDetailRoot() || document) : document;
  JD_SELECTORS.forEach(sel => {
    root.querySelectorAll(sel).forEach(el => {
      if (!isVisible(el)) return;
      if (el.closest('form, fieldset, [role="form"], .form, .application-form')) return;
      const controls = el.querySelectorAll('input,select,textarea,button'); if (controls.length >= 2) return;
      const raw = sanitize(txt(el)); const base = isLinkedInHost() ? raw : stripLabelishLines(raw);
      const t = cleanJDText(base); if (t) arr.push({ el, text: t, why: `sel:${sel}` });
    });
  });
  return arr;
}

// Exports
export { HEADING_RE, JD_SELECTORS, hasJDContainers, collectJDBySelectors };
