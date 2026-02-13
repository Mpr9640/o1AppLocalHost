
import {
  refreshTaxonomyIfStale,
  setRemoteTaxonomy,
} from '../../scripts/skillmatching.js';

import { apiClient } from '../../background.js'; // needed for apiClient.get()
const USE_REMOTE_TAXONOMY = false;
/* =================== Taxonomy refresh (optional) =================== */
async function maybeRefreshTaxonomy() {
  try {
    const stale = await refreshTaxonomyIfStale();
    if (!stale || !USE_REMOTE_TAXONOMY) return;
    try {
      const resp = await apiClient.get('/api/skills-taxonomy', { withCredentials: true });
      if (resp?.data && Array.isArray(resp.data?.skills)) {
        setRemoteTaxonomy(resp.data.skills, resp.data.synonyms || {});
        console.log('[bg] Applied remote taxonomy');
      }
    } catch {}
  } catch {}
}

export {
  USE_REMOTE_TAXONOMY,
  maybeRefreshTaxonomy
};
