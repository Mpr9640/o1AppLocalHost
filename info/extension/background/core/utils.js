//const log = (...a) => DEBUG && console.log('[bg]', ...a);
const ATS_HOSTS_RX = /(greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|myworkdayjobs\.com|icims\.com|taleo\.net|oraclecloud\.com|smartrecruiters\.com|apply\.workable\.com|bamboohr\.com|successfactors\.com|adp\.com|app\.jazz\.co|applytojob\.com|ashbyhq\.com|jobs\.ashbyhq\.com)/i;
const PLATFORM_HOSTS_RX = /(linkedin\.com|indeed\.com|glassdoor\.com|monster\.com|dice\.com|ziprecruiter\.com|careerbuilder\.com|simplyhired\.com|jobvite\.com|idealist\.org|jobhire\.ai)/i;
function isIndeedHost(url) {
  const u = typeof url === 'string' ? safeUrl(url) : url;
  return /(^|\.)indeed\./i.test(u.hostname);
}
const isATS = (u) => { try { return ATS_HOSTS_RX.test(new URL(u).hostname); } catch { return false; } };
const isPLATFORM = (u) => { try { return PLATFORM_HOSTS_RX.test(new URL(u).hostname); } catch { return false; } };
//const isPlatform = (u) => !isATS(u);
const isPlatform = (u) =>isPLATFORM(u);
function norm(s){ return String(s||'').replace(/\s+/g,' ').trim(); }

function sanitizeTitle(t) {
  const s = (t||'').trim();
  if (!s) return s;
  if (/^thank\s+you\s+for\s+applying\.?$/i.test(s)) return ''; // treat as empty → fall back to ctx
  if (/^application\s+(submitted|received)\.?$/i.test(s)) return '';
  return s;
}
/* Timeout helper 
const timeout = (p, ms) => new Promise((resolve, reject) => {
  let done = false;
  const to = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
  p.then(v => { if (done) return; clearTimeout(to); done = true; resolve(v); })
   .catch(e => { if (done) return; clearTimeout(to); done = true; reject(e); });
}); */
const timeout = (p, ms) =>
  new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(v => { clearTimeout(to); resolve(v); })
     .catch(e => { clearTimeout(to); reject(e); });
  });
function safeUrl(s) {
  try { return new URL(s); } catch { return null; }
}
function safeHttpUrl(u) {
  if (!u || typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    if (x.protocol === 'http:' || x.protocol === 'https:') return x.href;
  } catch {}
  return null;
}
function hasGoodMeta(meta) {
  if (!meta) return false;
  const tcl = [meta.title, meta.company, meta.location].filter(Boolean).length;
  return tcl >= 2; // or use scoreMeta(meta) >= 0.6
}
export {
  ATS_HOSTS_RX,
  PLATFORM_HOSTS_RX,
  isATS,
  isPLATFORM,
  isPlatform,
  norm,
  sanitizeTitle,
  timeout,
  safeHttpUrl,
  hasGoodMeta,
  isIndeedHost,
  safeUrl
};