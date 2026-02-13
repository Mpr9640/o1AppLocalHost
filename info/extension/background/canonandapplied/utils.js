
function scoreMeta(m = {}) {
  let s = 0;
  if (m.title) s += 2;
  if (m.company) s += 2;
  if (m.location) s += 1;
  if (m.logoUrl || m.logo_url) s += 1;
  if (m.jobId) s += 1;
  return s;
}
//updating dict with new entries if not null
function nonEmptyMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
  }
  return out;
}

export {
  scoreMeta,
  nonEmptyMerge
};