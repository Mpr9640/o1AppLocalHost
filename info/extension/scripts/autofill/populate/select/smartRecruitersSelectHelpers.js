
// smartRecruitersSelectHelpers.js

import { typeIntoComboInput, clickOptionLike } from "./helpers.js";
import { findComboInputFromAnchor, clickWithCoords } from "./workdaySelectHelpers.js";

// ✅ Needed by this file (used directly)
import { normalize, delay } from "../../utils.js";
import { clickLikeUser } from "../helpers.js";

//For smartrecruiters selcect inputs   ,   starting
// =======================================================
// SR SPL Autocomplete: Type + Select (NO Enter)
// Fixes:
//  1) Finds listbox even inside OPEN shadow roots
//  2) Extracts options even when they are SLOTTED / inside shadow roots
//  3) Matches by value attribute OR rendered text (shadow-safe)
// =======================================================

// Try multiple click styles because SPL options can be picky
function clickOptionBestEffort(opt) {
  if (!opt) return false;
  try { opt.scrollIntoView?.({ block: "nearest" }); } catch {}
  try { clickLikeUser?.(opt); } catch {}
  try {
    opt.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    opt.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    opt.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  } catch {}
  try { opt.click?.(); } catch {}
  try { clickWithCoords?.(opt); } catch {}
  return true;
}

// ===============================
// Deep query (OPEN shadowRoots + slots)
// ===============================
function deepQuerySelector(selector, root = document) {
  const seen = new Set();

  function visit(node) {
    if (!node || seen.has(node)) return null;
    seen.add(node);

    // Try normal querySelector at this node/root
    if (node.querySelector) {
      const hit = node.querySelector(selector);
      if (hit) return hit;
    }

    // Walk elements under this node
    const base = node === document ? document.documentElement : node;
    const walker = (node.ownerDocument || document).createTreeWalker(
      base,
      NodeFilter.SHOW_ELEMENT
    );

    let cur = walker.currentNode;
    while (cur) {
      // Traverse open shadow root
      if (cur.shadowRoot) {
        const srHit = visit(cur.shadowRoot);
        if (srHit) return srHit;
      }

      // Traverse slotted assigned elements
      if (cur.tagName === "SLOT") {
        const assigned = cur.assignedElements?.({ flatten: true }) || [];
        for (const a of assigned) {
          const aHit = visit(a);
          if (aHit) return aHit;
        }
      }

      cur = walker.nextNode();
    }

    return null;
  }

  return visit(root);
}

async function deepWaitForElement(selector, timeout = 1500, interval = 50, root = document) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const el = deepQuerySelector(selector, root);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

// Find SPL listbox for input: prefer exact aria-controls id
async function findSplListboxForInputDeep(input, timeout = 1500) {
  const menuId = input?.getAttribute?.("aria-controls");

  if (menuId) {
    const exact = await deepWaitForElement(`#${CSS.escape(menuId)}`, timeout);
    if (exact) return exact;
  }

  return await deepWaitForElement(
    'div[slot="menu"][role="listbox"], [role="listbox"][id^="menu-spl-"]',
    timeout
  );
}

// ===============================
// OPTION EXTRACTION (slots + open shadow roots)
// ===============================
function deepCollectAll(selector, root) {
  const out = [];
  const seen = new Set();

  function walk(node) {
    if (!node || seen.has(node)) return;
    seen.add(node);

    // Collect matches from this node if possible
    if (node.nodeType === 1 && node.matches?.(selector)) out.push(node);
    if (node.querySelectorAll) out.push(...node.querySelectorAll(selector));

    // Traverse open shadow root if this is an element
    if (node.nodeType === 1 && node.shadowRoot) {
      walk(node.shadowRoot);
    }

    // Traverse children
    const children = node.children ? Array.from(node.children) : [];
    for (const ch of children) {
      // Slot assigned elements (composed tree)
      if (ch.tagName === "SLOT") {
        const assigned = ch.assignedElements?.({ flatten: true }) || [];
        for (const a of assigned) walk(a);
      }
      walk(ch);
    }
  }

  walk(root);

  // De-dupe
  return Array.from(new Set(out));
}

async function waitForOptionsInListRoot(listRoot, timeout = 2500, interval = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // SPL options are hosts; role="option" fallback is ok too
    const opts = deepCollectAll('spl-select-option, [role="option"]', listRoot)
      .filter(el => el?.tagName === "SPL-SELECT-OPTION" || el?.getAttribute?.("role") === "option");

    if (opts.length) return opts;
    await new Promise(r => setTimeout(r, interval));
  }
  return [];
}

// Extract text even if rendered inside option's open shadowRoot
function deepTextContent(el) {
  if (!el) return "";
  let t = (el.textContent || "").trim();
  if (!t && el.shadowRoot) t = (el.shadowRoot.textContent || "").trim();
  return t;
}

// Optional: ensure we click the host option even if text is inside shadowRoot
function resolveClickableOptionHost(opt) {
  if (!opt) return null;
  if (opt.tagName === "SPL-SELECT-OPTION") return opt;
  // If we somehow got inner node, climb up
  return opt.closest?.("spl-select-option") || opt;
}

// =======================================================
// MAIN: Type + Select
// =======================================================
async function srSplTypeAndSelect(el, valStr) {
  try {
    const want = normalize(valStr);
    const trigger = el;
    if (!trigger) return false;

    // 1) Resolve typing surface
    let input = findComboInputFromAnchor(el);
    if (!input) input = trigger;

    if (!input) {
      console.log("SR SPL: No input/contenteditable found to type into.");
      return false;
    }

    // 2) Focus + type
    try { clickLikeUser?.(input); } catch {}
    try { input.focus?.(); } catch {}
    await delay(60);

    await typeIntoComboInput(input, valStr);
    await delay(200);

    // 3) Find listbox (open shadow-safe)
    const listRoot = await findSplListboxForInputDeep(input, 2000);
    if (!listRoot) {
      console.log("SR SPL: listbox not found after typing (aria-controls/slot menu).");
      return false;
    }

    console.log("SR SPL: listRoot is:", listRoot);

    // 4) Collect options (slot + shadow safe) + wait for them (timing)
    const options = await waitForOptionsInListRoot(listRoot, 3000);
    console.log("SR SPL: options found:", options.length, options);

    if (!options.length) {
      console.log("SR SPL: listbox exists but no options appeared (timing/virtualized).");
      return false;
    }

    // 5) Match target
    /*
    const getVal = (o) => normalize(o?.getAttribute?.("value"));
    const getTxt = (o) => normalize(deepTextContent(o));

    let target =
      options.find(o => getVal(o) === want) ||
      options.find(o => getVal(o).includes(want)) ||
      options.find(o => getTxt(o) === want) ||
      options.find(o => getTxt(o).includes(want));
    */
    const matchingOption = pickBestDropdownOption(options,want);
    let target = matchingOption?.raw;
    if (!target) target = options[0]; // optional: first suggestion

    target = resolveClickableOptionHost(target);

    if (!target) {
      console.log("SR SPL: no matching option for", valStr);
      try { document.body.click(); } catch {}
      return false;
    }

    console.log("SR SPL: selecting target:", target, "text:", deepTextContent(target), "value:", target.getAttribute?.("value"));

    //6) Click option
    const okKeyboard = await selectSplOptionByKeyboard(input, want, 40);
    if (okKeyboard) return true;

    const okMouse = await selectSplOptionByMouse(target);
    if (okMouse) return true;

    // last fallback: focus input + enter (some widgets select first item)
    try { input.focus?.(); } catch {}
    dispatchKey(input, "Enter");
    await delay(120);
    return true;
  } catch (e) {
    console.log("SR SPL: error in srSplTypeAndSelect", e);
    return false;
  }
}
async function selectSplOptionByMouse(targetOption) {
  if (!targetOption) return false;

  // Click inner content if present (often where handlers are)
  const inner =
    targetOption.shadowRoot?.querySelector?.(".c-spl-autocomplete-option-content") ||
    targetOption.querySelector?.(".c-spl-autocomplete-option-content") ||
    targetOption;

  try { inner.scrollIntoView?.({ block: "nearest" }); } catch {}
  await delay(80);

  // Human-ish: hover then click
  try {
    inner.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
    inner.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
    inner.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
  } catch {}

  // Click sequence
  try { clickOptionLike(inner); return true; } catch {}
  try { await clickWithCoords(inner); return true; } catch {}
  try { clickOptionBestEffort(inner); return true; } catch {}

  return false;
}

function dispatchKey(el, key, extra = {}) {
  const opts = {
    key,
    code: key === " " ? "Space" : key,
    keyCode:
      key === "Enter" ? 13 :
      key === "ArrowDown" ? 40 :
      key === "ArrowUp" ? 38 :
      key === "Escape" ? 27 : 0,
    which:
      key === "Enter" ? 13 :
      key === "ArrowDown" ? 40 :
      key === "ArrowUp" ? 38 :
      key === "Escape" ? 27 : 0,
    bubbles: true,
    cancelable: true,
    ...extra
  };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}


function getActiveDescendantEl(input) {
  const id = input?.getAttribute?.("aria-activedescendant");
  if (!id) return null;
  // active option might be inside open shadow roots; use your deepQuerySelector
  return deepQuerySelector(`#${CSS.escape(id)}`) || document.getElementById(id) || null;
}

function optionMatches(optionEl, want) {
  if (!optionEl) return false;
  const v = optionEl.getAttribute?.("value") || optionEl.getAttribute?.("data-value") || "";
  const t = deepTextContent(optionEl);
  return normalize(v) === want || normalize(t) === want || normalize(t).includes(want);
}

async function selectSplOptionByKeyboard(input, wantStr, maxSteps = 30) {
  const want = normalize(wantStr);
  if (!input) return false;

  // Focus input (human-like)
  try { input.focus?.(); } catch {}
  try { clickLikeUser?.(input); } catch {}
  await delay(60);

  // Make sure menu is open
  if (input.getAttribute("aria-expanded") !== "true") {
    // ArrowDown often opens menus universally
    dispatchKey(input, "ArrowDown");
    await delay(80);
  }

  // Try to reach target using active descendant / highlight movement
  for (let i = 0; i < maxSteps; i++) {
    const active = getActiveDescendantEl(input);

    // Sometimes active isn't set immediately; nudge it
    if (!active) {
      dispatchKey(input, "ArrowDown");
      await delay(60);
      continue;
    }

    if (optionMatches(active, want)) {
      // Enter should be dispatched on the INPUT (not the option)
      dispatchKey(input, "Enter");
      await delay(120);
      return true;
    }

    dispatchKey(input, "ArrowDown");
    await delay(60);
  }

  return false;
}

// End of smartrecruiters selct input code

export {
  clickOptionBestEffort,
  deepQuerySelector,
  deepWaitForElement,
  findSplListboxForInputDeep,
  deepCollectAll,
  waitForOptionsInListRoot,
  deepTextContent,
  resolveClickableOptionHost,
  srSplTypeAndSelect,
  selectSplOptionByMouse,
  dispatchKey,
  getActiveDescendantEl,
  optionMatches,
  selectSplOptionByKeyboard
};