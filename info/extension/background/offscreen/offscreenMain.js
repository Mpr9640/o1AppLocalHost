// (Remove local zero-shot/NER init — now proxied to offscreen)
let zeroShotDisabledUntil = 0;
let zeroShotTimeoutsInRow = 0;//==ML models
//let nerPipePromise = null;
let nerDisabledUntil = 0;
let nerTimeoutsInRow = 0;
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');
let creatingOffscreen = null;
async function ensureOffscreen() {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    console.log('[bg] ensureOffscreen start', OFFSCREEN_URL);

    // Check existence
    if (chrome.runtime.getContexts) {
      const ctx = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [OFFSCREEN_URL],
      });
      console.log('[bg] getContexts count:', ctx.length);
      if (ctx.length) return;
    } else if (chrome.offscreen.hasDocument) {
      const exists = await chrome.offscreen.hasDocument().catch(()=>false);
      console.log('[bg] hasDocument:', exists);
      if (exists) return;
    }

    // Create
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Run ML pipelines off the service worker to reduce latency',
    });
    console.log('[bg] offscreen created');
  })();
  try { await creatingOffscreen; } finally { creatingOffscreen = null; }
}

async function waitForOffscreenReady(tries = 60, delay = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' });
      if (res?.ok&& res?.mlReady) return true;
    } catch {}
    await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

async function rebuildOffscreenIfStuck() {
  // close & recreate, then ping again
  try { await chrome.offscreen.closeDocument(); } catch {}
  await ensureOffscreen();
  return await waitForOffscreenReady(60, 100);
}

async function callOffscreen(action, payload) {
  try {
    await ensureOffscreen();
    let ready = await waitForOffscreenReady();
    if (!ready) {
      console.warn('[bg] offscreen not ready, rebuilding…');
      ready = await rebuildOffscreenIfStuck();
    }
    if (!ready) return { ok:false, error:'Offscreen not ready' };
    return await chrome.runtime.sendMessage({ action, payload });
  } catch (e) {
    return { ok:false, error:String(e?.message || e) };
  }
}
function noteZSTimeout(){
  zeroShotTimeoutsInRow += 1;
  if (zeroShotTimeoutsInRow >= 2) zeroShotDisabledUntil = Date.now() + 5*60*1000;
}
function noteZSSuccess(){ zeroShotTimeoutsInRow = 0; }
/* NER infra  */
function noteNERTimeout(){ nerTimeoutsInRow+=1; if(nerTimeoutsInRow>=2) nerDisabledUntil=Date.now()+5*60*1000; }
function noteNERSuccess(){ nerTimeoutsInRow=0; }

export {
  zeroShotDisabledUntil,
  zeroShotTimeoutsInRow,
  nerDisabledUntil,
  nerTimeoutsInRow,
  OFFSCREEN_URL,
  ensureOffscreen,
  waitForOffscreenReady,
  rebuildOffscreenIfStuck,
  callOffscreen,
  noteZSTimeout,
  noteZSSuccess,
  noteNERTimeout,
  noteNERSuccess
};
