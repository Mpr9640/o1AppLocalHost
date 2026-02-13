// extension/content/autofill/reentry/icimsReentry.js

function initAutofillReentry(deps = {}) {
  const {
    pauseDetections = () => {},
    runDetection = () => {},
    // optional overrides for tests / future:
    hosts = ["icims.com"],
    bundlePath = "autofill.bundle.js",
    injectedId = "autofill-script",
    pendingKey = "ja_resume_pending_v1",
    reentryFlag = "__JA_AUTOFILL_REENTRY_IN_PROGRESS__",
    reentryTtlMs = 60 * 1000,
  } = deps;

  const SET1_HOSTS = new Set(hosts);
  const PENDING_KEY = pendingKey;
  const REENTRY_FLAG = reentryFlag;
  const INJECTED_ID = injectedId;
  const BUNDLE_PATH = bundlePath;
  const REENTRY_TTL_MS = reentryTtlMs;

  // ---- helpers (top-like host/page so iframes work) ----
  function topLikeHost() {
    try {
      if (window.top === window) return (location.hostname || "").toLowerCase();
      return window.top.location.hostname.toLowerCase(); // throws if cross-origin
    } catch {
      try {
        if (document.referrer) return new URL(document.referrer).hostname.toLowerCase();
      } catch {}
      return (location.hostname || "").toLowerCase();
    }
  }

  function topLikePageKey() {
    try {
      if (window.top === window) return `${location.origin}${location.pathname}`;
      const o = window.top.location;
      return `${o.origin}${o.pathname}`;
    } catch {
      try {
        if (document.referrer) {
          const u = new URL(document.referrer);
          return `${u.origin}${u.pathname}`;
        }
      } catch {}
      return `${location.origin}${location.pathname}`;
    }
  }

  function hostInHost(set, host) {
    const h = (host || "").toLowerCase();
    for (const d of set) if (h === d || h.endsWith(`.${d}`)) return true;
    return false;
  }

  const IS_SET1_TOP = hostInHost(SET1_HOSTS, topLikeHost());
  if (!IS_SET1_TOP) return; // identical gating

  function hasRealInputs() {
    return !!document.querySelector("input,select,textarea");
  }

  function waitForPageSettle({ urlQuietMs = 800, domQuietMs = 600, timeoutMs = 8000 } = {}) {
    const startUrl = location.href;
    let lastChange = performance.now();
    const mo = new MutationObserver(() => {
      lastChange = performance.now();
    });
    try {
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch {}
    const t0 = performance.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const now = performance.now();
        const urlChanged = location.href !== startUrl;
        const domIdle = now - lastChange >= domQuietMs;
        const urlIdle = urlChanged ? now - lastChange >= urlQuietMs : true;
        if ((domIdle && urlIdle) || now - t0 > timeoutMs) {
          clearInterval(timer);
          try { mo.disconnect(); } catch {}
          requestAnimationFrame(resolve);
        }
      }, 120);
    });
  }

  // ---- talk to service worker session helpers ----
  async function sessionGet(key) {
    const res = await chrome.runtime.sendMessage({ type: "SESSION_GET", payload: key });
    return res?.ok ? (res.data?.[key] ?? null) : null;
  }

  async function sessionRemove(key) {
    await chrome.runtime.sendMessage({ type: "SESSION_REMOVE", payload: key });
  }

  function looselyMatchesPage(pendingPage, currentTopLikePage) {
    if (!pendingPage || !currentTopLikePage) return false;
    if (pendingPage === currentTopLikePage) return true;
    try {
      const p = new URL(pendingPage),
        c = new URL(currentTopLikePage);
      if (p.origin !== c.origin) return false;
      const pp = p.pathname.split("/").slice(0, 3).join("/");
      const cp = c.pathname.split("/").slice(0, 3).join("/");
      return pp === cp;
    } catch {
      return false;
    }
  }

  async function maybeReenterAutofill() {
    if (!hasRealInputs()) {
      console.log("[reentry] no inputs in this frame; skipping");
      return;
    }
    if (window[REENTRY_FLAG]) {
      console.log("[reentry] flag set; skipping");
      return;
    }
    window[REENTRY_FLAG] = true;

    const pending = await sessionGet(PENDING_KEY);
    if (!pending) {
      console.log("[reentry] no pending key in session; abort");
      return;
    }
    console.log("[reentry] pending found:", pending);

    const topKey = topLikePageKey();
    if (!looselyMatchesPage(pending.page, topKey)) return;

    if (Date.now() - pending.t > REENTRY_TTL_MS) {
      console.log("[reentry] ttl expired");
      return;
    }

    const { autofillData } = await new Promise((r) => chrome.storage.local.get("autofillData", r));
    if (!autofillData) {
      console.log("[reentry] no autofillData; abort");
      return;
    }

    await waitForPageSettle();

    const url = chrome.runtime.getURL(BUNDLE_PATH);

    const callInit = async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ url);
        if (mod?.autofillInit) {
          window.__JA_busyAutofill = true;
          pauseDetections(250);

          await mod.autofillInit(autofillData, { reentry: true });

          await sessionRemove(PENDING_KEY);

          window.__JA_busyAutofill = false;
          pauseDetections(250);
          runDetection();
        } else {
          console.error("[reentry] autofillInit export not found");
        }
      } catch (e) {
        console.error("[reentry] import/module failed", e);
      }
    };

    if (document.getElementById(INJECTED_ID)) {
      await callInit();
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = url;
    script.id = INJECTED_ID;
    script.onload = callInit;
    script.onerror = () => console.error("[reentry] failed to load bundle:", url);
    document.documentElement.appendChild(script);
  }

  // keep identical behavior: auto-run after init
  maybeReenterAutofill();
}
export {initAutofillReentry};