import { readJSONLDJob } from "../jd/jsonld/jsonldMain.js";
function getLocationText() {
  const jl = readJSONLDJob();
  const jlLoc = (() => {
    const loc = jl?.jobLocation;
    if (!loc) return '';
    const asArr = Array.isArray(loc) ? loc : [loc];
    const addr = asArr[0]?.address;
    if (!addr) return '';
    const bits = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
    return bits.join(', ');
  })();
  if (jlLoc) return jlLoc;


  const sels = [
    // Indeed (new inline header)
    '[data-testid="inlineHeader-companyLocation"]',
    '[data-testid="companyLocation"]',
    // LinkedIn & generic fallbacks
    '[data-automation-id*="jobLocation"]',
    '.jobs-unified-top-card__job-insight .jobs-unified-top-card__bullet',
    '.top-card-layout__second-subline .jobs-unified-top-card__bullet',
    'ul[class="job-details"]',  // For smartrecruiters
    '.posting-categories .location',
    '.location',
    '[data-test="location"]',
    '.iCIMS_JobHeader .locations .iCIMS_JobHeaderFieldValue',
    '.jobsearch-JobInfoHeader-subtitle div:last-child',
    '[data-qa="posting-location"]',
    '.job__location',    //FOr bamboohr, .job__location,
    '.jv-job-detail-meta', // for jobvite
    '[data-careersite-property="city"]',  //For ey
    'div[data-test="location"]', '.JobDetails_badgeStyle'  //For glassdoor

  ];

  for (const sel of sels) {
   const t = document.querySelector(sel)?.textContent?.trim();
   if (t) {
    // normalize bullets: "Dallas, TX•Remote" → "Dallas, TX • Remote"
    return t.replace(/\s*[•·]\s*/g, ' • ');
   }
  }
  return '';
}

// Exports
export { getLocationText };
