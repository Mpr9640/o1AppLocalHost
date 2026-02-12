// scripts/skillmatching.js — lexicon/regex extractor + canonicalizer + fuzzy match (dedup fixed)

/* ---------------- Taxonomy ---------------- */

let CLIENT_TAXONOMY = new Set([
  // Languages
  "javascript","typescript","python","java","go","golang","c","c++","c#","ruby","php",
  "swift","kotlin","rust","scala","r","matlab","bash","powershell","backend","frontend","fullstack",
  // Web/UI
  "html","css","sass","less","tailwind","bootstrap","react","react native","next.js",
  "angular","vue","svelte","redux","graphql","rest","rest api","websocket",
  "ui/ux design","mobile development","ios","android",
  // Backend
  "node","node.js","express","django","flask","fastapi",".net","spring","spring boot","laravel","rails",
  // DevOps/Cloud
  "docker","kubernetes","k8s","helm","terraform","ansible","chef","puppet","jenkins","github actions","gitlab ci","circleci",
  "aws","amazon web services","azure","microsoft azure","gcp","google cloud platform",
  "lambda","ec2","s3","rds","dynamodb","cloudformation","cloudfront","vpc","iam","ecs","eks","fargate",
  "devops","systems administration","network configuration","troubleshooting","windows server","virtualization","ci/cd","sdlc",
  // Data/DB
  "postgresql","postgres","mysql","mariadb","sqlite","mongodb","redis","elasticsearch","cassandra","oracle","mssql","ms sql",
  "snowflake","redshift","bigquery","kafka","rabbitmq","sql","nosql",
  // Data/ML
  "pandas","numpy","scikit-learn","sklearn","pytorch","tensorflow","keras","xgboost","lightgbm","opencv",
  "machine learning","deep learning","nlp","natural language processing","transformers","huggingface","llm","spark","hadoop","databricks","airflow",
  "artificial intelligence","data visualization","tableau","power bi",
  // Testing/QA
  "jest","mocha","junit","pytest","cypress","playwright","quality control",
  // Tools
  "linux","git","github","gitlab","bitbucket","postman","swagger","openapi","vscode","intellij","jira","confluence",
  // Soft/other (select, not all)
  "agile","scrum","kanban","supervision","overtime","leadership","project management","collaboration","organization","technical design","control systems","public health"
]);

// Canonical synonyms (short, human forms — no weird expansions)
const SYN = new Map([
  ["js","javascript"], ["ts","typescript"],
  ["nodejs","node.js"], ["reactjs","react"], ["angularjs","angular"],
  ["dotnet",".net"], ["gh actions","github actions"],
  ["postgres","postgresql"], ["psql","postgresql"], ["ms sql","mssql"],
  ["k8s","kubernetes"],
  ["aws","amazon web services"], ["gcp","google cloud platform"], ["azure","microsoft azure"],
  ["ci/cd","ci/cd"],
  ["ml","machine learning"], ["ai","artificial intelligence"], ["nlp","natural language processing"],
  ["cad","computer-aided design"], ["fea","finite element analysis"], ["gd&t","geometric dimensioning and tolerancing"],
  ["plc","programmable logic controllers"], ["iot","internet of things"],
  // keep simple common names for these
  ["sql","sql"], ["nosql","nosql"], ["css","css"]
]);

const STOP = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","as","at","be","because","been","before","being",
  "below","between","both","but","by","did","do","does","doing","down","during","each","few","for","from","further","had","has","have",
  "having","he","her","here","hers","him","his","how","i","if","in","into","is","it","its","itself","me","more","most","my","myself","no",
  "nor","not","of","off","on","once","only","or","other","our","ours","ourselves","out","over","own","same","she","should","so","some",
  "such","than","that","the","their","theirs","them","themselves","then","there","these","they","this","those","through","to","too",
  "under","until","up","very","was","we","were","what","when","where","which","while","who","whom","why","with","would","you","your",
  "yours","yourself","yourselves"
]);

/* ------------- TTL / remote refresh (unchanged API) ------------- */
const TAX_TTL_MS = 12 * 60 * 60 * 1000; // 12h
export async function refreshTaxonomyIfStale() {
  try {
    const { taxonomyMeta } = await chrome.storage.local.get('taxonomyMeta');
    const stale = !taxonomyMeta || (Date.now() - (taxonomyMeta.ts || 0)) > TAX_TTL_MS;
    if (stale) { await chrome.storage.local.set({ taxonomyMeta: { ts: Date.now() } }); }
    return stale;
  } catch { return false; }
}
export function setRemoteTaxonomy(skills = [], synonyms = {}) {
  try {
    if (Array.isArray(skills) && skills.length) CLIENT_TAXONOMY = new Set(skills.map(s => String(s).toLowerCase().trim()));
    if (synonyms && typeof synonyms === 'object') {
      for (const [k,v] of Object.entries(synonyms)) SYN.set(String(k).toLowerCase().trim(), String(v).toLowerCase().trim());
    }
  } catch {}
}

/* ---------------- Canonicalization ---------------- */

const LEADING_FILLER_RX = /^(?:as|such as|including|include|with|using|use of|hands[\s-]*on|experience (?:with|in|of)|ideally with|familiar(?:ity)? with|knowledge of|proficiency in|skills in|code|coding in)\s+/i;
const TRAILING_FILLER_RX = /\s+(?:experience|skills|background|knowledge|proficiency|expertise)\s*$/i;

function clampSpaces(s){ return s.replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim(); }

export function normalizeSkill(s) {
  let x = clampSpaces((s || "").toLowerCase());
  x = x.replace(/[()]/g, "");
  x = x.replace(/\b(c)\s*(\+\+)\b/g, "c++");
  x = x.replace(/\b(c)\s*(sharp)\b/g, "c#");
  x = x.replace(/\b(node)\s*\.?\s*js\b/g, "node.js");
  x = x.replace(/\b(java)\s*\.?\s*script\b/g, "javascript");
  x = x.replace(LEADING_FILLER_RX, "");
  x = x.replace(TRAILING_FILLER_RX, "");
  x = clampSpaces(x);
  const syn = SYN.get(x);
  if (syn) x = syn;
  return x.trim();
}

/* If a phrase contains a known taxonomy/keeper token, reduce to that token */
const TAX_ARRAY = Array.from(CLIENT_TAXONOMY).sort((a,b)=>b.length-a.length);
function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function reduceToCanonicalToken(phrase) {
  const p = normalizeSkill(phrase);
  if (!p) return "";
  // Fast exits
  if (CLIENT_TAXONOMY.has(p)) return p;

  for (const term of TAX_ARRAY) {
    const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'i');
    if (re.test(p)) return normalizeSkill(term);
  }

  // Keeper patterns → canonical forms
  if (/\bnode\.?js\b/i.test(p)) return "node.js";
  if (/\baws\b|\bamazon web services\b/i.test(p)) return "amazon web services";
  if (/\bazure\b|\bmicrosoft azure\b/i.test(p)) return "microsoft azure";
  if (/\bgcp\b|\bgoogle cloud( platform)?\b/i.test(p)) return "google cloud platform";
  if (/\bci\/cd\b/i.test(p)) return "ci/cd";

  return p;
}

/* ---------------- Extractor ---------------- */

const KEEPER_PATTERNS = [
  /c\+\+/i, /\bc#\b/i, /\b\.net\b/i, /\bnode\.?js\b/i,
  /\brest(\s*api)?\b/i, /\bgraphql\b/i, /\bci\/cd\b/i,
  /\bkubernetes\b|\bk8s\b/i, /\baws\b|\bamazon web services\b/i, /\bazure\b|\bmicrosoft azure\b/i, /\bgcp\b|\bgoogle cloud\b/i
];

function looksLikeSkillPhrase(phrase) {
  if (CLIENT_TAXONOMY.has(phrase)) return true;
  if (KEEPER_PATTERNS.some(rx => rx.test(phrase))) return true;
  return false;
}
function looksLikeToken(tok) {
  if (!tok || STOP.has(tok)) return false;
  if (/[+#./]/.test(tok)) return true;
  if (/\d/.test(tok)) return true;
  if (/^[a-z]{2,}$/.test(tok) === false) return true;
  return tok.length >= 3;
}
function ngrams(words, nMax = 3) {
  const out = [];
  for (let n=1; n<=Math.min(nMax, words.length); n++) {
    for (let i=0; i+n<=words.length; i++) out.push(words.slice(i,i+n).join(' '));
  }
  return out;
}

// section-aware boost keywords
const SECTION_HEAD_RX = /(requirements|qualifications|skills|tech\s*stack|nice\s*to\s*have|preferred|responsibilities|what\s+you(?:'|’)?ll\s+do|what\s+you\s+will\s+do)/i;

function splitCandidates(line) {
  const parts = line
    // include '.' in the splitter to break "also considered.hands"
    .split(/[•·\-\u2013\u2014,*;:|/·.]+|(?:\s(?:and|or)\s)/i)
    .map(p => p.trim()).filter(Boolean);

  const out = [];
  for (const p of parts) {
    let words = p.split(/\s+/)
      .map(w => w.replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/gi, ""))
      .filter(Boolean)
      .map(normalizeSkill)
      .filter(Boolean);

    // Drop leading generic adjectives (already handled in normalizeSkill but keep a safety loop)
    while (words[0] && /^(experience|experiences|proficient|knowledge|familiar|hands-on|strong|solid|working|as|such|with|using|including)$/i.test(words[0])) {
      words.shift();
    }

    const grams = ngrams(words, 3).map(reduceToCanonicalToken);
    for (const g of grams) {
      if (!g || STOP.has(g)) continue;
      const tokens = g.split(" ");
      if (!tokens.some(looksLikeToken)) continue;
      if (looksLikeSkillPhrase(g)) out.push(g);
    }
  }
  return out;
}

// Returns Set of canonical skills; section boosts emulated by duplication then dedeup
export function extractSkillCandidates(jdText) {
  const lines = (jdText || "").replace(/\r/g, "").split(/\n+/).map(s => s.trim()).filter(Boolean);

  const picked = [];
  let sectionBoost = 0;
  for (const line of lines) {
    if (SECTION_HEAD_RX.test(line)) sectionBoost = 2; else if (sectionBoost > 0) sectionBoost -= 1;

    const keep =
      /^[-*•]/.test(line) ||
      line.length <= 200 ||
      /experience|proficient|knowledge|skills|requirements|qualifications|responsibilities|stack/i.test(line);
    if (!keep) continue;

    const cands = splitCandidates(line);
    for (const c of cands) {
      const canon = reduceToCanonicalToken(c);
      if (!canon) continue;
      picked.push(canon);
      if (sectionBoost) picked.push(canon);
    }
  }

  // Final canonical set
  const uniq = Array.from(new Set(picked.map(normalizeSkill)))
    .filter(x => x && !STOP.has(x));
  return new Set(uniq);
}

/* ---------------- User skills + fuzzy ---------------- */

export async function getUserSkillsSet() {
  const { autofillData } = await chrome.storage.local.get("autofillData");
  const raw = (autofillData?.skills || "").toString();
  const items = raw.split(",").map(s => normalizeSkill(s)).filter(Boolean);
  const filtered = items.filter(s => CLIENT_TAXONOMY.has(s) || KEEPER_PATTERNS.some(rx => rx.test(s)));
  return new Set(filtered);
}

export function fuzzyMatch(a, b, thresh = 0.88) {
  a = normalizeSkill(a); b = normalizeSkill(b);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const r = levRatio(a, b);
  return r >= thresh;
}
function levRatio(a, b) {
  const m = a.length, n = b.length;
  if (!m && !n) return 1;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0] = i;
  for (let j=0;j<=n;j++) dp[0][j] = j;
  for (let i=1;i<=m;i++) {
    for (let j=1;j<=n;j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}
