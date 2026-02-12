import { absUrl } from "../../../core/utils.js";
import { isLinkedInHost } from "../../../core/hosts.js";
import { getLinkedInLogoUrl } from "../linkedin/linkedIn.js";

function bestIcon() {
  const links = [...document.querySelectorAll('link[rel*="icon" i], link[rel*="apple-touch-icon" i]')];
  if (!links.length) return null;
  const parsed = links.map(l => {
    const sizes = l.getAttribute("sizes"); let score = 0;
    if (sizes) { const m = sizes.match(/(\d+)\s*x\s*(\d+)/i); if (m) score = Math.max(+m[1], +m[2]); }
    else if (/apple-touch-icon/i.test(l.rel)) score = 192; else score = 64;
    return { href: absUrl(l.href), score };
  }).filter(x => x.href);
  parsed.sort((a,b)=> b.score - a.score); return parsed[0]?.href || null;
}


//For glassdoor: .EmployerProfile_profileContainer img
//For twomenandatruck: 
function getCompanyLogoUrl() {
  if (isLinkedInHost()) {
    const liLogo = getLinkedInLogoUrl();
    if (liLogo) return liLogo;
    return ''; // avoid LinkedIn favicon
  }
  // twomenandatruck: <a id="logo" class="site-logo"> often uses CSS background-image
  const logoAnchor = document.querySelector('#logo.site-logo, a#logo.site-logo, .site-header a#logo');
  if (logoAnchor) {
    const bg = window.getComputedStyle(logoAnchor).backgroundImage;
    if (bg && bg !== 'none') {
      const url = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
      const abs = absUrl(url);
      if (abs) return abs;
    }
  }

  const sels = ['img[alt*="logo" i]','.company-logo img','.artdeco-entity-image img','.iCIMS_Logo img','.image-container img','img[aria-label*="logo" i]','.EmployerProfile_profileContainer img'];
  //for (const sel of sels) { const src = document.querySelector(sel)?.getAttribute('src'); if (src) return absUrl(src); }
  for (const sel of sels) {
  const src = document.querySelector(sel)?.getAttribute('src');
    if (src && typeof src === 'string') {
     const a = absUrl(src);
     if (a) return a;
    }
  }
  const og = document.querySelector('meta[property="og:image"]')?.content;
  if (og) return absUrl(og);
  return bestIcon() || absUrl('/favicon.ico');
}

// Exports
export { bestIcon, getCompanyLogoUrl };
