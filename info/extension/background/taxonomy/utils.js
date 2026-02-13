

/* =================== Matching (unchanged core) =================== */
const PROPER_CASE = new Map([
  ['javascript','JavaScript'],['typescript','TypeScript'],['java','Java'],
  ['react','React'],['node.js','Node.js'],['nodejs','Node.js'],['node','Node.js'],
  ['postgres','PostgreSQL'],['postgresql','PostgreSQL'],
  ['github','GitHub'],['github actions','GitHub Actions'],
  ['docker','Docker'],['kubernetes','Kubernetes'],
  ['aws','AWS'],['amazon web services','AWS'],
  ['gcp','GCP'],['google cloud platform','GCP'],
  ['azure','Azure'],['microsoft azure','Azure'],
  ['ai','AI'],['artificial intelligence','AI'],
  ['ml','ML'],['machine learning','ML'],
  ['control systems','Control Systems'],
]);

// (… glue helpers unchanged …)
const LEADING_GLUE = /\b(?:experience|experienced|with|using|leverag(?:e|ing)|we|ideally|strong|solid|working|hands[- ]?on|proficiency|proficient|knowledge|understanding|ability|capability|exposure|familiar(?:ity)?|background|in|on|for|of|and|or|the|a|an)\b\s*/i;
const TRAILING_GLUE = /\s*\b(?:experience|preferred|plus|considered|also|etc|skills?|knowledge|background|exposure)\b\.?$/i;
function stripGlue(s){ let t=s.trim(); for(let i=0;i<4;i++){ const b=t; t=t.replace(LEADING_GLUE,'').replace(TRAILING_GLUE,'').trim(); if(t===b)break;} return t; }
function normalizeFreeText(s){ let t=(s||'').toLowerCase(); t=t.replace(/[–—]/g,'-').replace(/[“”]/g,'"').replace(/[’']/g,"'"); t=t.replace(/[^a-z0-9+#.\s]/g,' ').replace(/\s+/g,' ').trim(); t=t.replace(/\bto\s+\w.+$/i,'').trim(); return t; }
function normalizeCoreSkill(s){ const raw=stripGlue(normalizeFreeText(s)); if(!raw) return ''; const d=PROPER_CASE.get(raw); if(d) return d; if(raw.includes('amazon web services')) return 'AWS'; if(raw.includes('google cloud platform')) return 'GCP'; if(raw.includes('microsoft azure')) return 'Azure'; const pc=PROPER_CASE.get(raw.replace(/\./g,''))||PROPER_CASE.get(raw); if(pc) return pc; const words=raw.split(' ').filter(Boolean).map(w=>{ if(['aws','gcp','ai','ml','sql','nosql','nlp','ci','cd'].includes(w))return w.toUpperCase(); if(w==='github')return'GitHub'; if(w==='postgresql'||w==='postgres')return'PostgreSQL'; if(w==='javascript')return'JavaScript'; if(w==='typescript')return'TypeScript'; if(w==='react')return'React'; if(/^[a-z]/.test(w))return w[0].toUpperCase()+w.slice(1); return w; }); return words.join(' '); }
function dropGlueExpansions(canonArr){ const stop=new Set(['with','using','to','and','or','the','a','an','of','in','on','for','build','develop','design','leverage','we','ideally','experience','preferred','plus','also','considered']); const tokens=s=>s.toLowerCase().split(/\s+/).filter(Boolean); const keep=new Set(canonArr); const arr=Array.from(keep); for(let i=0;i<arr.length;i++){ for(let j=0;j<arr.length;j++){ if(i===j)continue; const a=arr[i],b=arr[j]; if(!a||!b)continue; const ta=tokens(a),tb=tokens(b); const idx=tb.join(' ').indexOf(ta.join(' ')); if(idx===-1)continue; const rest=tb.filter(w=>!ta.includes(w)); if(rest.length && rest.every(w=>stop.has(w))){ keep.delete(b);} } } return Array.from(keep); }
function postProcessSkills(raw){ const canon=raw.map(normalizeCoreSkill).filter(Boolean); const uniq=[]; const seen=new Set(); for(const s of canon){ const k=s.toLowerCase(); if(!seen.has(k)){ seen.add(k); uniq.push(s);} } const pruned=dropGlueExpansions(uniq); return pruned.slice(0,200); }

export {
  PROPER_CASE,
  LEADING_GLUE,
  TRAILING_GLUE,
  stripGlue,
  normalizeFreeText,
  normalizeCoreSkill,
  dropGlueExpansions,
  postProcessSkills
};