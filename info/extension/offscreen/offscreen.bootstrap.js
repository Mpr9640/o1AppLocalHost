// offscreen.bootstrap.js
// Tiny dispatcher: replies to PING immediately, then lazy-imports the heavy bundle once.
// Now includes mlReady ping + import failure handling.

let ready = false;
let loading = false;
let mod = null;       // ESM module namespace from offscreen.bundle.js
const queue = [];     // messages that arrive before the bundle is ready

chrome.runtime.onMessage.addListener((req, _s, sendResponse) => {
  // Always answer readiness pings immediately
  if (req?.type === 'OFFSCREEN_PING') {
    sendResponse({ ok: true, mlReady: !!ready });
    return;
  }

  // Ignore everything that isn't explicitly for the offscreen module
  if (!req || typeof req.action !== 'string' || !req.action.startsWith('offscreen.')) {
    return; // not handled
  }

  // If not ready, queue and start loading bundle
  if (!ready) {
    queue.push({ req, sendResponse });

    if (!loading) {
      loading = true;
      (async () => {
        try {
          if (!mod) {
            const url = chrome.runtime.getURL('offscreen.bundle.js'); // your build output
            mod = await import(url);
          }
          ready = true;
          loading = false;

          // Drain queued messages
          for (const item of queue.splice(0)) {
            dispatch(item.req, item.sendResponse);
          }
        } catch (e) {
          console.error('[offscreen] failed to import offscreen.bundle.js', e);
          // Mark as not ready; background will see mlReady=false
          ready = false;
          loading = false;
          mod = null;

          // Fail all queued requests so callers don't hang
          for (const item of queue.splice(0)) {
            try {
              item.sendResponse({ ok: false, error: 'bundle_import_failed' });
            } catch {}
          }
        }
      })();
    }

    return true; // keep channel open for queued response
  }

  // Ready: route immediately
  return dispatch(req, sendResponse);
});

function dispatch(req, sendResponse) {
  try {
    if (!mod) {
      sendResponse({ ok: false, error: 'module_not_loaded' });
      return false;
    }

    if (req.action === 'offscreen.bestMatch') {
      mod.handleBestMatch(req.payload || {}).then(sendResponse).catch(err => {
        sendResponse({ ok:false, error:String(err?.message || err) });
      });
      return true;
    }

    if (req.action === 'offscreen.zs') {
      mod.handleZeroShot(req.payload || {}).then(sendResponse).catch(err => {
        sendResponse({ ok:false, error:String(err?.message || err) });
      });
      return true;
    }

    if (req.action === 'offscreen.ner') {
      mod.handleNER(req.payload || {}).then(sendResponse).catch(err => {
        sendResponse({ ok:false, error:String(err?.message || err) });
      });
      return true;
    }

    sendResponse({ ok: false, error: 'Unknown offscreen action' });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }
  return false;
}
