
import {
  extractSkillCandidates,
  normalizeSkill,
} from '../../scripts/skillmatching.js';

import { maybeRefreshTaxonomy } from './refreshTaxonomy.js';
import { postProcessSkills } from './utils.js';

import { timeout } from '../core/utils.js';

import {
  noteNERTimeout,
  noteNERSuccess,
  callOffscreen, // optional, see getNER note below
} from '../offscreen/offscreenMain.js';

async function extractSkillsHybrid(jdText){
  await maybeRefreshTaxonomy();
  let skills=new Set(extractSkillCandidates(jdText));
  if(skills.size<8 || skills.size>200){
    try{
      const ner=await getNER();
      // smaller slice, similar recall, lower latency (2A)
      const run = timeout(ner(jdText.slice(0,4000), { aggregation_strategy: 'simple' }), 1200);
      const out=await run; noteNERSuccess();
      for(const ent of out||[]){ const w=normalizeSkill(ent.word||ent.entity||ent.entity_group||''); if(!w)continue; if(!/[a-z0-9+#.]/i.test(w))continue; skills.add(w); if(skills.size>=180)break; }
    }catch(e){ if(String(e?.message||e).includes('timeout')) noteNERTimeout(); }
  }
  return postProcessSkills(Array.from(skills));
}

export {
  extractSkillsHybrid
};
