// canon & canonical helpers
import {
  canonicalJobUrl,
  canonicalJobUrlCached,
  removeCanonical
} from './canon.js';

// job journey context (tab-based canonical preference)
import {
  preferCtxCanonical
} from '../jobjourney/journeybyTab.js';

// API client (background.js owns backend communication)
import {
  apiClient
} from '../../background.js';

//rememberAppliedInstant,Write Data,Reads existing map, adds new job record, and writes the updated map back to storage.	return value(void (nothing))
async function rememberAppliedInstant(url, iso) { //remebering instant applied url with time
  try {
    const canon = canonicalJobUrl(url);
    if (!canon) return;
    const key = 'appliedInstantMap';
    const cur = await new Promise(res => chrome.storage.local.get(key, v => res(v[key] || {})));
    cur[canon] = iso || new Date().toISOString();
    await new Promise(res => chrome.storage.local.set({ [key]: cur }, () => res()));
  } catch {}
}
//getInstantApplied	Read Data,	Reads existing map from storage and checks if the job exists.	returns Timestamp or null
async function getInstantApplied(url) { //checking if job url  was previously marked as instant applied url
  try {
    const canon = canonicalJobUrl(url);
    const key = 'appliedInstantMap';
    const cur = await new Promise(res => chrome.storage.local.get(key, v => res(v[key] || {})));
    return canon ? cur[canon] || null : null;
  } catch { return null; }
}
// TCL → ISO map (local instant cache mirrored from saves)
const appliedTclMapKey = 'appliedTclMap';
async function getTclMap() {
  const r = await new Promise(res => chrome.storage.local.get(appliedTclMapKey, v => res(v[appliedTclMapKey] || {})));
  return r;
}
async function setTclMap(obj) {
  await new Promise(res => chrome.storage.local.set({ [appliedTclMapKey]: obj }, () => res()));
}
function tclKey({ title, company, location }) {
  const norm = (s) => String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim();
  return [norm(title), norm(company), norm(location)].filter(Boolean).join(' | ');
}
//saving title,company name and location into chrome storage with timestamp
async function rememberAppliedTcl(meta, iso) {
  const key = tclKey(meta);
  if (!key) return;
  const map = await getTclMap();
  map[key] = iso || new Date().toISOString();
  await setTclMap(map);
}
async function persistApplied({ title, company, location, url, logo_url, source = 'extension', applied_at }, sender) {
  const canonical = canonicalJobUrlCached(preferCtxCanonical(sender, url));
  const when = applied_at || new Date().toISOString();

  const body = {
      title: title || 'Unknown',
      company: company || '',
      location: location || '',
      url: canonical,
      status: 'applied',
      source,
      company_logo_url: logo_url || null,
      applied_at: when
  };

  const res = await apiClient.post('/api/jobs', body, { withCredentials: true });
  const savedAt = res?.data?.applied_at || when;

  await rememberAppliedInstant(canonical, savedAt);
  await rememberAppliedTcl(body, savedAt);
  removeCanonical(canonical);

  return { res, canonical, savedAt };
}

export {
  rememberAppliedInstant,
  getInstantApplied,
  getTclMap,
  setTclMap,
  tclKey,
  rememberAppliedTcl,
  persistApplied
};
