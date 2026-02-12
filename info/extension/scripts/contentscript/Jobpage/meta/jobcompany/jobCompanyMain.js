import { readJSONLDJob } from "../jd/jsonld/jsonldMain.js";

function getCompanyName() {
  const jl = readJSONLDJob();
  const fromJL = jl?.hiringOrganization?.name || jl?.hiringOrganization || '';
  if (fromJL && typeof fromJL === 'string') return fromJL.trim();

 // For glassdoor,.EmployerProfile_employerNameHeading h4
  //twomenandatruck : company name is often in visually-hidden text under #logo
  const logoAnchor = document.querySelector('#logo.site-logo, a#logo.site-logo');
  if (logoAnchor) {
    const hidden = logoAnchor.querySelector('.visually-hidden, .sr-only');
    const t = hidden?.textContent?.trim();
    if (t) {
      // "Two Men and a Truck Careers Home" -> "Two Men and a Truck"
      const cleaned = t.replace(/\s*careers?\s*home\s*$/i, '').trim();
      if (cleaned) return cleaned;
      return t;
    }
  }
  const sels = [
    // Indeed (new inline header)
    '[data-testid="inlineHeader-companyName"] a',
    '[data-company-name="true"] a',
    '[data-testid="companyName"]',

    // LinkedIn (keep)
    '.job-details-jobs-unified-top-card__company-name a',
    '.topcard__org-name-link',
    '.top-card-layout__entity-info a',
    '.jobs-unified-top-card__company-name',

    // Generic / other ATS
    '.company,[data-company]',
    '.posting-company,[data-qa="posting-company-name"]',
    '.iCIMS_JobHeader .iCIMS_InlineText:not(.title)',
    '.job-company',
    '.EmployerProfile_employerNameHeading',
    '.EmployerProfile_employerNameHeading__bXBYr'

  ];

  for (const sel of sels) {
    const t = document.querySelector(sel)?.textContent?.trim();
    if (t) return t;
  }

  const og = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
  // Ignore generic hosts (avoid "LinkedIn", "Indeed", etc.)
  if (og && !/^(linkedin|indeed|glassdoor|dice|jobright\.ai|monster)$/i.test(og)) return og;

  // Final fallback: subdomain, but never return "www"
  const parts = location.hostname.split('.');
  const sub = parts.length>2 ? parts.slice(0,-2).join('.') : parts[0];
  if (!sub || /^www\d*$/i.test(sub)) return '';
  return sub;
}

// Exports
export { getCompanyName };
