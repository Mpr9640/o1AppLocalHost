// offscreen.js
// Offscreen ML handlers: bestMatch (embeddings), zero-shot, NER
// Updated: mlReady ping handled in bootstrap; this file focuses on model logic.

import { env, pipeline } from '@xenova/transformers';

// -------------------------
// Small utilities
// -------------------------
const now = () => Date.now();

function norm(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDegreeish(ctx = {}) {
  const h = norm(ctx.humanName || ctx.fieldName || '');
  return /(degree|education|qualification|level|highest|school)/.test(h);
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// If vectors are normalized, cosine = dot. Still safe if slightly off.
function cosine(a, b) {
  if (!a || !b || !a.length || !b.length) return -1;
  return dot(a, b);
}

function cheapTokenOverlap(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

function hashString(str) {
  // simple fast hash (djb2-ish) good enough for cache keys
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// -------------------------
// LRU cache
// -------------------------
class LRU {
  constructor(limit = 200) {
    this.limit = limit;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
}

// -------------------------
// Model pipelines
// -------------------------
// Choose a good small embedding model.
// You can swap to bge-small if you already have it packaged.
// const EMBED_MODEL = 'Xenova/bge-small-en-v1.5';
const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';

let embedPipePromise = null;
async function getEmbedder() {
  if (embedPipePromise) return embedPipePromise;

  embedPipePromise = (async () => {
    // ONNX runtime wasm paths (your folder). Keep if you ship wasm assets.
    try {
      env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('offscreen/vendor/onnx/');
    } catch {}

    // IMPORTANT: allow local assets shipped with extension
    env.allowLocalModels = true;

    // Cache can help, but real speed comes from our own caches.
    env.useBrowserCache = true;

    // Create pipeline
    return await pipeline('feature-extraction', EMBED_MODEL, {
      quantized: true,
    });
  })();

  return embedPipePromise;
}

// Optional: keep your existing ZS/NER if you use them.
// Here we leave stubs if your bundle already implements them.
// If you want, you can keep your original ZS/NER code under these.
let zsPipePromise = null;
async function getZeroShot() {
  if (zsPipePromise) return zsPipePromise;
  zsPipePromise = pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli', { quantized:true });
  return zsPipePromise;
}

let nerPipePromise = null;
async function getNER() {
  if (nerPipePromise) return nerPipePromise;
  nerPipePromise = pipeline('token-classification', 'Xenova/bert-base-NER', { quantized:true });
  return nerPipePromise;
}

// -------------------------
// Embedding output normalization
// -------------------------
function toVec(out) {
  // Handles vec-like structures and tries to return Float32Array/Array<number>
  if (!out) return null;
  if (out instanceof Float32Array) return out;
  if (Array.isArray(out) && typeof out[0] === 'number') return out;
  const data = out?.data || out?.tensor?.data;
  if (data instanceof Float32Array) return data;
  return null;
}

function splitBatchVecs(out) {
  // If already array of per-item outputs
  if (Array.isArray(out)) {
    const vecs = out.map(toVec).filter(Boolean);
    if (vecs.length) return vecs;
  }

  // Tensor-like: dims = [B, D] and data is flat
  const data = out?.data || out?.tensor?.data;
  const dims = out?.dims || out?.tensor?.dims;

  if (data instanceof Float32Array && Array.isArray(dims) && dims.length === 2) {
    const [B, D] = dims;
    const vecs = [];
    for (let i = 0; i < B; i++) {
      vecs.push(data.slice(i * D, (i + 1) * D));
    }
    return vecs;
  }

  // Fallback: try flatten into one vec
  const v = toVec(out);
  return v ? [v] : [];
}

// -------------------------
// Caches for bestMatch
// -------------------------
// Cache answer embeddings by normAnswer
const answerVecCache = new LRU(300);

// Cache option-set embeddings by signature hash
// value: { labelsNorm: string[], vecs: Float32Array[], ts: number }
const labelSetCache = new LRU(120);

// Cache final bestMatch results for exact request (optional micro-opt)
const resultCache = new LRU(300);

// -------------------------
// Public handlers (called by bootstrap)
// -------------------------
export async function handleBestMatch(payload = {}) {
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const answer = (payload.answer || '').toString();
  const ctx = payload.ctx || {};
  const forceMethod = payload.method || ''; // optional: 'embed' | 'zs'
  const debug = !!payload.debug;

  if (!labels.length || !answer.trim()) {
    return { ok: false, error: 'missing_labels_or_answer' };
  }

  const normAnswer = norm(answer);
  const normLabels = labels.map(l => norm(l));

  // Quick exact/contains before any ML
  {
    const exact = normLabels.findIndex(l => l === normAnswer);
    if (exact >= 0) return { ok:true, labelIndex: exact, label: labels[exact], score: 1.0, method: 'exact' };

    const contains = normLabels.findIndex(l => l.includes(normAnswer) || normAnswer.includes(l));
    if (contains >= 0) return { ok:true, labelIndex: contains, label: labels[contains], score: 0.92, method: 'contains' };
  }

  // Result cache key
  const cacheKey = `bm:${hashString(normLabels.join('\n'))}:${hashString(normAnswer)}:${isDegreeish(ctx) ? 'deg' : 'gen'}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  // Thresholds (tune as needed)
  const degree = isDegreeish(ctx);
  const threshold = payload.threshold ?? (degree ? 0.70 : 0.78);

  // Prefer embeddings by default
  if (!forceMethod || forceMethod === 'embed') {
    const r = await bestMatchByEmbeddings(normLabels, labels, normAnswer, ctx, { threshold, debug });
    // If ok or confident fail (don’t pick), cache and return
    resultCache.set(cacheKey, r);
    return r;
  }

  // If explicitly forced zero-shot
  if (forceMethod === 'zs') {
    const r = await bestMatchByZeroShot(normLabels, labels, normAnswer, { threshold: Math.max(0.55, threshold - 0.1) });
    resultCache.set(cacheKey, r);
    return r;
  }

  return { ok:false, error:'unknown_method' };
}

async function bestMatchByEmbeddings(normLabels, rawLabels, normAnswer, ctx, { threshold, debug } = {}) {
  const embed = await getEmbedder();

  // 1) Answer vec
  let ansVec = answerVecCache.get(normAnswer);
  if (!ansVec) {
    const out = await embed([normAnswer], { pooling: 'mean', normalize: true });
    const vecs = splitBatchVecs(out);
    ansVec = vecs[0];
    if (ansVec) answerVecCache.set(normAnswer, ansVec);
  }

  if (!ansVec) {
    return { ok:false, error:'answer_embedding_failed' };
  }

  // 2) Label set vecs (cached by signature)
  const sig = hashString(normLabels.join('\n'));
  let labelPack = labelSetCache.get(sig);

  if (!labelPack || !labelPack.vecs || labelPack.vecs.length !== normLabels.length) {
    const out = await embed(normLabels, { pooling: 'mean', normalize: true });
    const vecs = splitBatchVecs(out);

    // If model returns a single vec (shouldn't), bail
    if (!vecs || vecs.length !== normLabels.length) {
      return { ok:false, error:'label_embedding_failed', details:{ got: vecs?.length, want: normLabels.length } };
    }

    labelPack = { labelsNorm: normLabels, vecs, ts: now() };
    labelSetCache.set(sig, labelPack);
  }

  // 3) Similarity scan
  let bestI = -1;
  let bestS = -Infinity;

  for (let i = 0; i < labelPack.vecs.length; i++) {
    const s = cosine(ansVec, labelPack.vecs[i]);
    if (s > bestS) { bestS = s; bestI = i; }
  }

  // 4) Tie-break: if multiple close, use token overlap
  // (Useful when options are short like "Masters", "Master's", etc.)
  if (bestI >= 0) {
    const close = [];
    for (let i = 0; i < labelPack.vecs.length; i++) {
      const s = cosine(ansVec, labelPack.vecs[i]);
      if (bestS - s <= 0.03) close.push({ i, s });
    }
    if (close.length > 1) {
      let tBest = close[0];
      let tScore = -1;
      for (const c of close) {
        const t = cheapTokenOverlap(normAnswer, normLabels[c.i]);
        if (t > tScore) { tScore = t; tBest = c; }
      }
      bestI = tBest.i;
      bestS = tBest.s;
    }
  }

  // 5) Threshold guard
  if (bestI < 0 || bestS < threshold) {
    // Do NOT pick if below threshold
    return {
      ok: false,
      labelIndex: -1,
      score: bestS,
      method: 'embed',
      reason: 'below_threshold',
      threshold,
      debug: debug ? { bestS, threshold } : undefined
    };
  }

  return {
    ok: true,
    labelIndex: bestI,
    label: rawLabels[bestI],
    score: bestS,
    method: 'embed'
  };
}

async function bestMatchByZeroShot(normLabels, rawLabels, normAnswer, { threshold = 0.65 } = {}) {
  // Zero-shot is slower and less reliable for dropdown matching.
  // Only use when explicitly forced.
  const zs = await getZeroShot();

  const res = await zs(normAnswer, rawLabels, { multi_label: false });
  // res.labels (sorted), res.scores (sorted)
  if (!res || !Array.isArray(res.labels) || !Array.isArray(res.scores)) {
    return { ok:false, error:'zs_failed' };
  }

  const bestLabel = res.labels[0];
  const bestScore = res.scores[0] ?? 0;
  const idx = rawLabels.findIndex(l => l === bestLabel);

  if (idx < 0 || bestScore < threshold) {
    return { ok:false, labelIndex:-1, score:bestScore, method:'zs', reason:'below_threshold', threshold };
  }

  return { ok:true, labelIndex: idx, label: rawLabels[idx], score: bestScore, method:'zs' };
}

export async function handleZeroShot(payload = {}) {
  const text = (payload.text || '').toString();
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  if (!text || !labels.length) return { ok:false, error:'missing_text_or_labels' };
  const zs = await getZeroShot();
  const res = await zs(text, labels, payload.options || {});
  return { ok:true, res };
}

export async function handleNER(payload = {}) {
  const text = (payload.text || '').toString();
  if (!text) return { ok:false, error:'missing_text' };
  const ner = await getNER();
  const res = await ner(text, payload.options || {});
  return { ok:true, res };
}
