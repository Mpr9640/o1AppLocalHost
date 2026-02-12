//problems: we need to add bestmatch option for select inputs.

import { isVisible, norm, delay } from '../../utils.js';
import { simulatePointerClick } from '../helpers.js';

import {
  splitMultiValues,
  fuzzyScore,
  distance,
  getCenter,
  waitForNearestListbox,
  clickOptionLike,
  typeIntoComboInput,
  tryClosePopup
} from './helpers.js';


//In workday, For choosing the option when theu use button(arrow)/instead of select
function isWorkdayCombo(el){ 
  // Prefer the nearest WD-ish container if present, else fall back to a div
  const root = el.closest(
    '[data-automation-id*="select"],' +                 // e.g., multiSelectContainer, selectDropdown, etc.
    '[data-uxi-widget-type="selectinput"],' +          // WD select input widget
    '[data-automation-id*="multiSelect"],' +           // multiSelectContainer
    '[data-automation-id*="prompt"],' +                // promptIcon / promptOption
    'div'
  );
  if (!root) return false;

  // Base signals (your originals)
  const hasButton = !!root.querySelector('button[aria-haspopup="listbox"], button[aria-expanded]');
  const hasText   = !!root.querySelector('input[type="text"], input:not([type]), input[role="combobox"], [role="combobox"]');
  const hasArrow  = !!root.querySelector('[data-automation-id="promptIcon"], [class*="promptIcon"], span, svg, i');

  // Workday-specific strong signals (seen in your screenshot)
  const hasWDAtt = (
    root.matches('[data-automation-id], [data-uxi-widget-type]') ||
    !!root.querySelector(
      '[data-automation-id*="select"],' +
      '[data-automation-id*="multiSelect"],' +
      '[data-automation-id*="prompt"],' +
      '[data-uxi-widget-type="selectinput"]'
    )
  );

  // Nearby listbox cues (often rendered/telegraphed even if virtualized)
  const hasListboxHints = !!root.querySelector(
    '[role="listbox"], [aria-controls*="listbox"], [id*="listbox"], [data-automation-id*="selectDropdown"]'
  );

  // Two ways to declare "combo":
  // 1) Your original triad (button + text + arrow)
  // 2) WD multiselect variant (text + WD signals + (arrow OR listbox hints))
  const classicCombo = hasButton && hasText && hasArrow;
  const wdCombo = hasText && hasWDAtt && (hasArrow || hasListboxHints);

  const result = classicCombo || wdCombo;
  // Optional debug
  // console.log({ classicCombo, wdCombo, hasButton, hasText, hasArrow, hasWDAtt, hasListboxHints });
  return result;
}
//IN workday, for multiselect container with 3 bar icon symbol.(degree,field of study,skills)
function isWorkdayMultiSelect(el) {
  if (!el) return false;

  // IMPORTANT: do NOT include "div" here.
  // We want the real WD widget root, not the nearest random div.
  const root = el.closest(
    [
      '[data-uxi-widget-type="multiselect"]',
      '[data-automation-id="multiSelectContainer"]',
      '[data-automation-id="multiSelectInputContainer"]',
      '[data-automation-id*="multiselect" i]',
      '[data-automation-id*="multiSelect" i]',
    ].join(',')
  );

  if (!root) return false;

  // Bubble up to the main container so siblings like the prompt button are visible.
  const scope =
    root.closest('[data-automation-id*="multiSelectContainer" i], [data-uxi-widget-type="multiselect"]') ||
    root;

  const hasMultiContainer =
    scope.matches('[data-automation-id*="multiSelectContainer" i], [data-uxi-widget-type="multiselect"], [data-automation-id*="multiSelectInputContainer" i]') ||
    !!scope.querySelector('[data-automation-id*="multiSelectContainer" i], [data-uxi-widget-type="multiselect"], [data-automation-id*="multiSelectInputContainer" i]');

  const hasSearchBox =
    !!scope.querySelector('[data-uxi-widget-type="selectinput"], [data-automation-id*="searchbox" i], [data-automation-id*="monikersearchbox" i]');

  const hasPrompt =
    !!scope.querySelector('[data-automation-id*="promptSearchButton" i], [data-automation-id*="promptIcon" i], [data-automation-id*="promptOption" i]');

  // Chips / list items often render alongside the input and are a strong signal.
  const hasListItems =
    !!scope.querySelector('[data-automation-id*="multiSelectListItem" i], [data-automation-id*="responsiveMonikerPrompt" i]');

  const ok = (hasMultiContainer || hasListItems) && (hasSearchBox || hasPrompt);

  console.log('[WD multi?]', ok, { hasMultiContainer, hasSearchBox, hasPrompt, hasListItems, rootAutomationId: root.getAttribute?.('data-automation-id'), rootUxiType: root.getAttribute?.('data-uxi-widget-type') });

  return ok;
}
async function waitUntil(fn, ms = 1200, step = 50) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    try { if (await fn()) return true; } catch {}
    await new Promise(r => setTimeout(r, step));
  }
  return false;
}
// Helpers for workday multiselect inputs(degree,field of study,skills, how did you hear about us)
function findComboInputFromAnchor(el) {
  const root =
    el.closest('[role="combobox"]') ||
    el.closest('[data-uxi-widget-type="multiselectlist"]') ||
    el.closest('[data-automation-id*="multiSelect"]') ||
    el.closest('label')?.parentElement ||
    el.parentElement;

  if (!root) return null;

  return (
    root.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]') ||
    null
  );
}

function getActiveListboxNear(el, radius = 900) {
  const anchorCenter = getCenter(el);

  const candidates = [...document.querySelectorAll('[role="listbox"], [role="menu"]')]
    .filter(isVisible)
    .map(lb => {
      const d = distance(anchorCenter, getCenter(lb));
      return { lb, d };
    })
    .filter(x => x.d <= radius)
    .sort((a, b) => a.d - b.d);

  if (!candidates.length) return null;

  // Prefer one that has an active descendant (means it’s the “live” one)
  const withActive = candidates.find(x => x.lb.getAttribute('aria-activedescendant'));
  return (withActive?.lb) || candidates[0].lb;
}

function getWorkdayMultiSelectRootFromInput(inputEl) {
  if (!inputEl) return null;

  const msId = inputEl.getAttribute("data-uxi-multiselect-id");
  if (msId) {
    const root = document.querySelector(`[data-uxi-multiselect-id="${CSS.escape(msId)}"]`);
    if (root) return root;
  }

  // fallback: climb to a known container
  return (
    inputEl.closest('[data-uxi-widget-type="multiselect"]') ||
    inputEl.closest('[data-uxi-widget-type="multiselectlist"]') ||
    inputEl.closest('[data-automation-id="multiSelectContainer"]') ||
    inputEl.closest('[role="combobox"]') ||
    inputEl.parentElement
  );
}

function getSelectedTokenTextsFromInput(inputEl) {
  const root = getWorkdayMultiSelectRootFromInput(inputEl);
  if (!root) return new Set();

  // chips/pills are highly variable; use multiple safe patterns
  const tokenNodes = root.querySelectorAll([
    '[data-automation-id*="selected"]',
    '[data-automation-id*="pill"]',
    '[data-automation-id*="tag"]',
    '[role="listitem"]',
    '[aria-label*="remove"]',
    // sometimes Workday renders tokens as buttons
    'button[aria-label*="Remove"]',
  ].join(','));

  const out = new Set();
  for (const n of tokenNodes) {
    const t = norm(n.textContent || "");
    if (t) out.add(t);
  }
  return out;
}



function closeWorkdayDropdown(el, listbox) {
  // Prefer Escape (safe), then click away
  try {
    const doc = el?.ownerDocument || document;
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    doc.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
  } catch {}
  try {
    if (listbox && isVisible(listbox)) clickOptionLike(document.body);
  } catch {}
}

function isToggleButton(n){
  if (!n || n.nodeType !== 1) return false;
  const tag = n.tagName?.toLowerCase();
  if (tag === 'button') {
    return n.hasAttribute('aria-haspopup') || n.hasAttribute('aria-expanded');
  }
  // Some UIs use div/span with role=button
  if ((n.getAttribute('role') === 'button') && n.hasAttribute('aria-haspopup')) return true;
  return false;
}

/**
 * Finds the nearest dropdown toggle button for a Workday-like combo.
 * Looks at self, then scans container & a few ancestors for a matching button.
 */
function findNearestDropdownButton(el, maxHops = 3){
  if (!el) return null;
  if (isToggleButton(el)) return el; // if caller passed the button itself

  // Prefer a semantic container first
  let container = el.closest('[data-automation-id], [role="group"], .wd-select, .wd-input, .MuiAutocomplete-root, .ant-select, div');

  // Walk up a few levels; within each, query for a proper toggle button
  let node = container || el;
  for (let i = 0; node && i <= maxHops; i++, node = node.parentElement) {
    const btn = node.querySelector(
      'button[aria-haspopup="listbox"], button[aria-expanded], [role="button"][aria-haspopup="listbox"]'
    );
    if (isToggleButton(btn)) return btn;
  }
  return null;
}
function isWorkdayHeaderLike(text) {
  const t = (text || "").trim().toLowerCase();
  return (
    t === "search results" ||
    t === "no items" ||
    t === "no items." ||
    t === "search" ||
    t === ""
  );
}

function collectWorkdayOptionWrappers(listbox) {
  if (!listbox) return [];

  // Prefer option wrappers
  let wrappers = Array.from(listbox.querySelectorAll('[role="option"]'));

  // Fallback: some Workday variants use menuItem as the wrapper
  if (!wrappers.length) {
    wrappers = Array.from(listbox.querySelectorAll('[data-automation-id="menuItem"]'));
  }

  const lbRect = listbox.getBoundingClientRect();

  const visible = wrappers.filter(w => {
    if (!w || !w.isConnected) return false;
    if (w.getAttribute("aria-disabled") === "true") return false;

    const txt = w.textContent?.trim();
    if (isWorkdayHeaderLike(txt)) return false;

    const r = w.getBoundingClientRect();
    const inViewport =
      r.height > 0 &&
      r.width > 0 &&
      r.top < lbRect.bottom - 2 &&
      r.bottom > lbRect.top + 2;

    return inViewport;
  });

  // Dedup by normalized text (keep the first visible wrapper)
  const seen = new Set();
  const out = [];
  for (const w of visible) {
    const t = norm(w.textContent);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(w);
  }
  return out;
}

async function clickWithCoords(el) {
  if (!el) return false;

  // Focus helps Workday treat it as the active item
  try { el.focus?.({ preventScroll: true }); } catch {}

  // Let scroll/virtualization settle
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 80));

  const r = el.getBoundingClientRect();
  const x = Math.floor(r.left + r.width / 2);
  const y = Math.floor(r.top + r.height / 2);
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };

  // IMPORTANT: dispatch on el itself (not elementFromPoint)
  el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));

  const enterOpts = { key: "Enter", code: "Enter", keyCode: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
  el.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
  el.dispatchEvent(new KeyboardEvent("keyup", enterOpts));


  try { el.click(); } catch {}
  return true;
}

async function waitForStableRect(el, { frames = 2, timeout = 1400 } = {}) {
  const start = performance.now();
  let stable = 0;
  let last = null;

  while (performance.now() - start < timeout) {
    if (!el || !el.isConnected) return false;

    const r = el.getBoundingClientRect();
    const cur = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;

    if (cur === last) stable++;
    else stable = 0;

    last = cur;
    if (stable >= frames) return true;

    await new Promise(r => requestAnimationFrame(r));
  }
  return true; // best effort
}


function pickWorkdayClickable(wrapper) {
  if (!wrapper) return null;

  // In your HTML screenshot, this is the best target:
  const prompt = wrapper.querySelector?.('[data-automation-id="promptOption"]');

  const radio = wrapper.querySelector?.('[data-automation-id="radioBtn"]');
  const checkbox = wrapper.querySelector?.('[data-automation-id="checkbox"]');
  const checkboxPanel = wrapper.querySelector?.('[data-automation-id="checkboxPanel"]');

  // leaf often highlights but doesn’t commit selection reliably
  const leaf = wrapper.querySelector?.('[data-automation-id="promptLeafNode"]');

  return  leaf ||radio || checkbox ||  prompt || wrapper || checkboxPanel ;
}

function isWorkdaySelected(wrapper) {
  if (!wrapper) return false;
  if (wrapper.getAttribute?.("aria-checked") === "true") return true;

  const input = wrapper.querySelector?.('input[type="checkbox"], input[type="radio"]');
  if (input && input.checked) return true;

  // Workday sometimes marks selection on promptOption
  const prompt = wrapper.querySelector?.('[data-automation-id="promptOption"]');
  if (prompt?.getAttribute?.("aria-selected") === "true") return true;

  return false;
}

async function workdayClickOption(wrapper) {
  if (!wrapper) return false;

  // 1) Choose target + scroll it
  let clickable = pickWorkdayClickable(wrapper);
  if (!clickable) return false;
  try { clickable.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" }); } catch {}
  clickable.classList?.add("autofill-highlight");
  setTimeout(() => clickable.classList?.remove("autofill-highlight"), 500);
    // 2) wait for scroll/layout + Workday re-render to settle
  await waitForStableRect(clickable, { frames: 2, timeout: 1400 });
  // 3) Re-pick inside wrapper (virtualization can replace inner nodes)
  clickable = pickWorkdayClickable(wrapper) || clickable;
  // 4) Click
  await clickWithCoords(clickable);
  // 5) Verify + retry once (very common in Workday)
  await new Promise(r => setTimeout(r, 120));
  if (!isWorkdaySelected(wrapper)) {
    // small nudge scroll + retry
    try { clickable.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" }); } catch {}
    await new Promise(r => setTimeout(r, 120));
    clickable = pickWorkdayClickable(wrapper) || clickable;
    await clickWithCoords(clickable);
  }

  return true;
}

async function scanAndSelectWorkdayMulti(
  listbox,
  inputEl,
  targetText,
  {
    timeout = 3000,
    exactFirst = true,
    verifyDelay = 150,
    getSelected = null, // optional: () => Set(normalize)
    onBeforeClick = null,
  } = {}
) {
  const start = performance.now();
  const want = norm(targetText);
  if (!want) return false;

  // snapshot before, for verification
  const beforeSelected = getSelected ? getSelected() : null;

  let bestInclude = null; // { w, score, txt, fz }
  let bestFuzzy = null;   // { w, score, txt }

  const includeScore = (txt, want) => {
    if (txt === want) return 100;
    if (txt.startsWith(want)) return 80;
    if (txt.includes(want)) return 60;
    if (want.includes(txt)) return 40;
    return -Infinity;
  };

  while (performance.now() - start < timeout) {
    const options = collectWorkdayOptionWrappers(listbox);

    // early exit: no items
    if (options.length === 1 && norm(options[0].textContent).includes("no item")) return false;

    for (const w of options) {
      const txt = norm(w.textContent);
      console.log('Options I got',txt);
      if (!txt) continue;

      if (exactFirst && txt === want) {
        onBeforeClick?.(w, txt);
        console.log('Going to select',w)
        workdayClickOption(w);
        await delay(verifyDelay);
        return verifyWorkdaySelection(listbox, inputEl, want, beforeSelected, getSelected);
      }

      if (txt.includes(want) || want.includes(txt)) {
        const cand = { w, score: includeScore(txt, want), txt, fz: fuzzyScore(txt, want) };
        if (!bestInclude || cand.score > bestInclude.score || (cand.score === bestInclude.score && cand.txt.length < bestInclude.txt.length)) {
          bestInclude = cand;
        }
        continue;
      }

      const fz = fuzzyScore(txt, want);
      if (!bestFuzzy || fz > bestFuzzy.score) bestFuzzy = { w, score: fz, txt };
    }

    // scroll listbox to trigger virtualization if needed
    const atBottom = Math.ceil(listbox.scrollTop + listbox.clientHeight) >= listbox.scrollHeight;
    if (atBottom) break;

    listbox.scrollTop = Math.min(
      listbox.scrollTop + Math.max(60, Math.floor(listbox.clientHeight * 0.9)),
      listbox.scrollHeight
    );
    await delay(80);
  }

  // click best include/fuzzy after scan
  const pick = bestInclude?.w || bestFuzzy?.w;
  if (pick) {
    onBeforeClick?.(pick, norm(pick.textContent));
    console.log('Going to select2',pick)
    workdayClickOption(pick);
    await delay(verifyDelay);
    return verifyWorkdaySelection(listbox, inputEl, want, beforeSelected, getSelected);
  }

  return false;
}

function verifyWorkdaySelection(listbox, inputEl, want, beforeSelected, getSelected) {
  // 1) listbox closed
  const lbOpen = listbox?.isConnected && listbox.offsetParent !== null;
  if (!lbOpen) return true;

  // 2) selected token changed (best)
  if (getSelected && beforeSelected) {
    const after = getSelected();
    if (after && after.size > beforeSelected.size) return true;
    if (after && after.has(want)) return true;
  }

  // 3) input cleared or changed away from typed value
  const v = norm(inputEl?.value || "");
  if (!v || v !== want) return true;

  return false;
}

function collectFilteredOptionNodes(listbox) {
  if (!listbox) return [];
  
  // Collect all potential option nodes
  const allOptions = [
    ...listbox.querySelectorAll('[role="option"]'),
    ...listbox.querySelectorAll('[data-automation-id="promptOption"]'),
    ...listbox.querySelectorAll('[data-automation-id="menuItem"]'),
  ];
  
  // ✅ De-duplicate by DOM element (not text, since duplicates might be scrolled copies)
  const uniqueElements = [...new Set(allOptions)];
  
  const lbRect = listbox.getBoundingClientRect();
  
  // ✅ Filter to only visible, non-header items
  const filtered = uniqueElements.filter(opt => {
    // Must be visible
    if (!isVisible(opt)) return false;
    
    // Get text
    const text = opt.textContent?.trim();
    if (!text) return false;
    
    // ✅ Skip non-selectable items
    if (text.toLowerCase() === 'search results') return false;
    if (text.toLowerCase() === 'no items.') return false;
    if (text.toLowerCase() === 'no items') return false;
    
    // ✅ Skip if aria-disabled
    if (opt.getAttribute('aria-disabled') === 'true') return false;
    
    // Must be in viewport of listbox
    const optRect = opt.getBoundingClientRect();
    const isInViewport = 
      optRect.top < lbRect.bottom - 2 && 
      optRect.bottom > lbRect.top + 2 &&
      optRect.height > 0 &&
      optRect.width > 0;
    
    return isInViewport;
  });
  
  // ✅ Further deduplicate by text content (keep first occurrence)
  const seenTexts = new Set();
  const deduplicated = [];
  
  for (const opt of filtered) {
    const text = norm(opt.textContent);
    if (!seenTexts.has(text)) {
      seenTexts.add(text);
      deduplicated.push(opt);
    }
  }
  
  return deduplicated;
}
function collectOptionNodes(listbox) {
  if(!listbox) return [];
  // Workday variants + fallbacks (role=option most common)
  const sel = [
    '[role="option"]',
    '[data-automation-id="option"]',
    '[role="menuitem"]',
    'li',
    '.wd-option' // rare custom class; harmless if absent
  ].join(',');

  // Only return clickable/visible ones
  return [...listbox.querySelectorAll(sel)].filter(isClickableVisible);
}
/**
 * Open a Workday-style dropdown via its button, find the nearest popup listbox,
 * scroll through all options (even virtualized), select the best match, and close.
 *
 * @param {HTMLElement} el - the toggle button itself OR any descendant of the WD combo
 * @param {string} value  - visible text you want to pick
 * @param {object} opts   - { timeout?: number, radius?: number, exactFirst?: boolean }
 * @returns {Promise<boolean>}
 */
//workday selects
async function fillWorkdayByButton(el, value, opts = {}) {
  const {
    humanName = "",
    timeout = 1500,
    radius = 700,
    exactFirst = true
  } = opts;
  //const timeout = opts.timeout ?? 1500;
  //const exactFirst = opts.exactFirst ?? true;
  //const humanName = opts.humanName?? "";
  const btn = findNearestDropdownButton(el);
  console.log('btn found in fillworkday:',btn);
  if (!btn) return false;
  // 1) Open the popup
  simulatePointerClick(btn);
  await waitUntil(() => btn.getAttribute('aria-expanded') === 'true', 350);
  // 2) Find nearest listbox to this button
  let listbox = await waitForNearestListbox(btn, timeout, radius);
  console.log('list box found:',listbox);
  if (!listbox) {
    console.log('list box not found, so trying one more time')
    // one retry: click again then re-scan
    simulatePointerClick(btn);
    await delay(120);
    listbox = await waitForNearestListbox(btn, timeout, radius);
    console.log('fter trying 2nd time listbox',listbox);
    if (!listbox) return false;
  }
  // 3) Try to select the option by scanning (handles virtualized lists via scrolling)
  const picked = await scanAndSelectOption(listbox, value, {...opts,timeout,radius, exactFirst, humanName });
  if (!picked) {
    // fallback: send ESC to close if still open
    console.log('No picked options')
    tryClosePopup(btn, listbox);
    return false;
  }
  // 4) Close the popup (many WD lists auto-close on selection; but ensure)
  tryClosePopup(btn, listbox);
  return true;
}
async function fillWorkdayMultiSelectByButton(el, rawValue, opts = {}) {
  const {
    humanName = "",
    timeout = 1800,
    radius = 900,
    exactFirst = true,
    closeAtEnd = true,
    defaultCollectTimeout = 800,
    defaultCollectMin = 6,
    skipIfAlreadySelected = true,
    pressEnterAfterType = true,
  } = opts;

  const values = splitMultiValues(rawValue).map(v => v.trim()).filter(Boolean);
  if (!values.length) return false;
  console.log('raw value:',rawValue);
  console.log('The values are going to fill are:',values);

  let anyPicked = false;
  let selected = getSelectedTokenTextsFromInput(el);

  for (const v of values) {
    const want = norm(v);
    if (!want) continue;

    if (skipIfAlreadySelected && selected.has(want)) {
      console.log(`Skipping "${v}" - already selected`);
      continue;
    }

    const start = performance.now();
    let pickedThis = false;
    
    while (performance.now() - start < timeout && !pickedThis) {
      // 1) Click to focus/open
      clickOptionLike(el);
      await delay(80);

      // 2) Get input
      const input =
        findComboInputFromAnchor?.(el) ||
        el.closest('[role="combobox"]')?.querySelector('input,textarea,[contenteditable="true"]') ||
        el.querySelector?.('input,textarea,[contenteditable="true"]') ||
        null;

      if (!input) {
        console.log('No input found, retrying...');
        await delay(120);
        continue;
      }

      // 3) Type the value
      await typeIntoComboInput(input, v);
      await delay(150); // Increased delay for Workday to process

      // 4) ✅ Press Enter to filter
      if (pressEnterAfterType) {
        input.dispatchEvent(new KeyboardEvent("keydown", { 
          key: "Enter", 
          code: "Enter", 
          keyCode: 13, 
          which: 13,
          bubbles: true, 
          cancelable: true 
        }));
        input.dispatchEvent(new KeyboardEvent("keyup", { 
          key: "Enter", 
          code: "Enter", 
          keyCode: 13,
          which: 13, 
          bubbles: true, 
          cancelable: true 
        }));
        
        // ✅ Critical: Wait for Workday to filter and re-render
        await delay(2000);
      }

      // 5) Wait for listbox
      let listbox = getActiveListboxNear(el, radius);
      if (!listbox) {
        listbox = await waitForNearestListbox(el, 900, radius);
      }
      
      if (!listbox) {
        console.log('No listbox found, retrying...');
        await delay(120);
        continue;
      }

      console.log('Listbox found for multiselect, waiting for filtered options...');

      // 6) ✅ Wait for filtered options to stabilize
      const t0 = performance.now();
      let filteredOptions = [];
      let stableCount = 0;
      let lastCount = 0;
      
      while (performance.now() - t0 < defaultCollectTimeout) {
        //filteredOptions = collectFilteredOptionNodes(listbox);
        filteredOptions = collectWorkdayOptionWrappers(listbox)
        
        // Wait for count to stabilize (no duplicates appearing)
        if (filteredOptions.length > 0 && filteredOptions.length === lastCount) {
          stableCount++;
          if (stableCount >= 2) break; // Stable for 2 iterations
        } else {
          stableCount = 0;
        }
        lastCount = filteredOptions.length;
        
        await delay(50);
      }

      if (filteredOptions.length > 0) {
        const optionsText = [...new Set(filteredOptions.map(opt => opt.textContent?.trim()))];
        console.log(`Found ${optionsText.length} unique filtered options:`, optionsText);
      }

      // 7) ✅ Scan and select with SCROLLING enabled
      /*
      const ok = await scanAndSelectOption(listbox, v, {
        humanName,
        exactFirst,
        timeout: 2000, // Increased timeout for scrolling
        typeFallback: false, // Already typed
        typeEl: input,
        collectFn: (lb) => collectFilteredOptionNodes(lb), // Fresh collection each scroll
      });
       */
      const ok = await scanAndSelectWorkdayMulti(listbox, input, v, {
        exactFirst,
        timeout: 2000,
        getSelected: () => getSelectedTokenTextsFromInput(el), // you already have this
      });

      if (ok) {
        pickedThis = true;
        anyPicked = true;
        selected = getSelectedTokenTextsFromInput(el);
        console.log(`✅ Successfully selected: ${v}`);
        await delay(150);
        break;
      } else {
        console.log(`❌ Failed to select: ${v}, retrying...`);
      }

      await delay(120);
    }
    
    if (!pickedThis) {
      console.log(`⚠️ Could not select "${v}" after timeout`);
    }
  }

  if (closeAtEnd) {
    const lb = await waitForNearestListbox(el, 250, radius);
    if (lb) closeWorkdayDropdown(el, lb);
  }

  return anyPicked;
}
export {
  isWorkdayCombo,
  isWorkdayMultiSelect,
  waitUntil,
  findComboInputFromAnchor,
  getActiveListboxNear,
  getWorkdayMultiSelectRootFromInput,
  getSelectedTokenTextsFromInput,
  closeWorkdayDropdown,
  isToggleButton,
  findNearestDropdownButton,
  isWorkdayHeaderLike,
  collectWorkdayOptionWrappers,
  clickWithCoords,
  waitForStableRect,
  pickWorkdayClickable,
  isWorkdaySelected,
  workdayClickOption,
  scanAndSelectWorkdayMulti,
  verifyWorkdaySelection,
  collectFilteredOptionNodes,
  collectOptionNodes,
  fillWorkdayByButton,
  fillWorkdayMultiSelectByButton
};
