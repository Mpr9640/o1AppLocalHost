import {
  normalize,
  normalizeFieldNameWithSpace,
  delay,
  isAshbyHost,
  isGreenhouseHost,
  isSmartRecruitersCareersHost,
  isSmartRecruitersHost,
  isSuccessEuHost,
  isMetaHost,
  norm
} from '../../utils.js';

import {
  splitMultiValues,
  isComplexDropdown,
  bestOptionMatch,
  waitForElement,
  waitForNearestListbox,
  pickBestDropdownOption,
  clickOptionLike,
  findComboInputForListbox,
  typeIntoComboInput,
  collectVisibleOptionNodes,
  fuzzyScore,
  tryClosePopup,
} from './helpers.js';

import {
  findSearchInputAfterClick,
} from './metaSelectHelpers.js';

import {
  simulateMouse,
  simulatePointerClick,
} from '../helpers.js';

import {deepTextContent} from "./smartRecruitersSelectHelpers.js";
import {sendKey} from "./successEuSelectHelpers.js";
import { clickWithCoords,waitUntil} from "./workdaySelectHelpers.js";
import { srSplTypeAndSelect, selectSplOptionByMouse } from './smartRecruitersSelectHelpers.js';
import { typeIntoComboInputForSuccessEu } from './successEuSelectHelpers.js';
async function fillSelectElement(el, value, opts={}) {
  if (!el || el.disabled || el.readOnly) return;
  const {
    mapped = false,
    humanName = "",
    timeout,
    exactFirst,
    radius
  } = opts;

  const tag = el.tagName?.toUpperCase?.();
  const valStr = (value ?? '').toString().trim();
  if (!valStr) return;
  // Scroll to make it visible
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  simulateMouse(el);
  await delay(50);

  /*
  // ----- Case 1: Native <select> (single)
  if (tag === 'SELECT' && !el.multiple) {
    console.log('1. fillselectelement func,select but not multiple');
    const match = [...el.options].find(opt =>
      normalizeFieldNameWithSpace(opt.textContent || '').includes(
        normalizeFieldNameWithSpace(valStr)
      )
    );
    if (match) {
      el.value = match.value;
      el.selectedIndex = match.index;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  if (tag === 'SELECT' && !el.multiple) {
   
    const labels = [...el.options].map(o => o.textContent || '');
    const sem = await bestOptionMatch(labels, valStr, { humanName: opts.humanName, min: semanticMinThreshold(opts.humanName) });
    if (sem?.ok) {
      const match = [...el.options].find(o => (o.textContent || '').trim() === sem.label.trim());
      if (match) {
        el.value = match.value;
        el.selectedIndex = match.index;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  }

  // ----- Case 2: Native <select multiple>
  if (tag === 'SELECT' && el.multiple) {
    console.log('2. Fillselectelement func select and multiple');
    const vals = splitMultiValues(valStr);
    let changed = false;
    for (const opt of el.options) {
      const shouldSelect = vals.some(v => 
        normalizeFieldNameWithSpace(opt.textContent || '').includes(normalizeFieldNameWithSpace(v)) || 
        (normalizeFieldNameWithSpace(opt.textContent || '') === normalizeFieldNameWithSpace(v)) 
      );
      if (opt.selected !== shouldSelect) {
        opt.selected = shouldSelect;
        changed = true;
      }
    }
    if (changed) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  } */

  // ----- Case 3: Custom dropdown (MUI / Ant / React-Select / Ashby)
  //Ashby selects
  if (isComplexDropdown(el) && (isAshbyHost || isGreenhouseHost)) {
    console.log('3. fillselectelement func select and complexdropdown');
    const timeout = opts.timeout ?? 1500;
    const radius  = opts.radius ?? 700;
    const exactFirst = opts.exactFirst ?? true;
    /*const btn = findNearestDropdownButton(el);
    console.log('btn found in fillworkday:',btn);
    //if (!btn) return false;
    // 1) Open the popup
    //simulatePointerClick(btn);
    */
    const findComboTextInput = (root) => {
      if (root.tagName === 'INPUT') return root;
      return (
        root.querySelector('input[type="text"]') ||
        root.querySelector('input:not([type])') ||
        root.querySelector('[role="textbox"]') ||
        root
      );
    };
    const textBox = findComboTextInput(el);
    if (!textBox) return false;
    // 3.2 set the value with native setter + input events so React sees it
    const setNative = (input, val) => {
      const proto = Object.getPrototypeOf(input);
      const desc  = Object.getOwnPropertyDescriptor(proto, 'value');
      const setter = desc && desc.set;
      if (setter) setter.call(input, val);
      else input.value = val;

      try { input.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, inputType:'insertText', data:String(val) })); } catch {}
      input.dispatchEvent(new Event('input',  { bubbles:true, composed:true }));
      input.dispatchEvent(new Event('change', { bubbles:true, composed:true }));
    };

    // 3.3 focus, put the text, nudge with a key to trigger filtering
    textBox.focus();
    simulateMouse(textBox);
    setNative(textBox, valStr);
    textBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    textBox.dispatchEvent(new KeyboardEvent('keyup',   { key: 'ArrowDown', bubbles: true }));
    await waitUntil(() => textBox.getAttribute('aria-expanded') === 'true', 350);
    // 2) Find nearest listbox to this button
    let listbox = await waitForNearestListbox(textBox, timeout, radius);
    console.log('list box found:',listbox);
    if (!listbox) {
      console.log('list box not found, so trying one more time')
      // one retry: click again then re-scan
      simulatePointerClick(textBox);
      await delay(120);
      listbox = await waitForNearestListbox(textBox, timeout, radius);
      console.log('fter trying 2nd time listbox',listbox);
      if (!listbox) return false;
    }
    // 3) Try to select the option by scanning (handles virtualized lists via scrolling)
    //const picked = await scanAndSelectOption(listbox, value, { exactFirst, timeout });
    const picked = await scanAndSelectOption(listbox, value, {
      exactFirst,
      timeout,
      humanName: opts.humanName
    });

    if (!picked) {
      // fallback: send ESC to close if still open
      console.log('No picked options')
      tryClosePopup(textBox, listbox);
      return false;
    }
    // 4) Close the popup (many WD lists auto-close on selection; but ensure)
    tryClosePopup(textBox, listbox);
    return true;
  }
  // Case 3: Custom dropdown (MUI/Ant/React-Select etc.) 
  if (isComplexDropdown(el)) { 
    console.log('4. fillselectelement func select and complexdropdown2') 
    let didSelect = false;
    try { 
      // SMARTRECRUITERS SELECT2 HANDLING (TRY FIRST)
      if (isSmartRecruitersCareersHost) {
        const isSelect2 =
          el.classList?.contains('select2-hidden-accessible') ||
          !!el.closest('.smartrecruiters-form-control--single-select');
        const isMultiSelect2 = el.classList?.contains('select2-hidden-accessible') ||
          !!el.closest('.smartrecruiters-form-control--multiselect');

        if (isSelect2) {
          console.log('Detected SmartRecruiters Select2 dropdown');

          // ---- Find Select2 visible container (sibling of hidden select)
          let container =
            (el.nextElementSibling && el.nextElementSibling.classList.contains('select2'))
              ? el.nextElementSibling
              : el.parentElement?.querySelector('span.select2.select2-container');

          const trigger =
            container?.querySelector('.select2-selection') ||
            container?.querySelector('[role="combobox"]') ||
            container;

          if (trigger) {
            clickWithCoords(trigger);
          } else {
            clickWithCoords(el);
          }

          await delay(120);

          // ---- Wait for Select2 dropdown (usually appended to body)
          const dropdown = await waitForElement(
            'ul.select2-results__options[role="tree"], .select2-results__option, .select2-dropdown',
            1200
          );

          if (dropdown) {
            const want = normalizeFieldNameWithSpace(valStr);

            const options = [...dropdown.querySelectorAll(
              'li.select2-results__option[role="treeitem"], li[role="treeitem"], .select2-results__option'
            )].filter(opt =>
              !opt.classList.contains('select2-results__option--disabled') &&
              opt.getAttribute('aria-disabled') !== 'true' &&
              (opt.textContent || '').trim().length > 0
            );

            //let target =
              //options.find(o => normalizeFieldNameWithSpace(o.textContent) === want) ||
              //options.find(o => normalizeFieldNameWithSpace(o.textContent).includes(want));
            const matchingOption = pickBestDropdownOption(options,want);
            let target = matchingOption?.raw;
            if (target) {
              console.log('Select2 target found:', target.textContent);
              clickWithCoords(target);
              await delay(300);
              didSelect = true;
              return true;
            }
          }

          // Close Select2 before fallback
          document.body.click();
        }
        if(isMultiSelect2){
          console.log('Detected SmartRecruiters MultiSelect2 dropdown');
          // ---- Find Select2 visible container (sibling of hidden select)
          //let skipIfAlreadySelected = true;
          let container =
            (el.nextElementSibling && el.nextElementSibling.classList.contains('select2'))
              ? el.nextElementSibling
              : el.parentElement?.querySelector('span.select2.select2-container');
      
          const trigger =
            container?.querySelector('.select2-selection') ||
            container?.querySelector('[role="combobox"]') ||
            container;
          if (trigger) {
            clickWithCoords(trigger);
            await delay(300);
          } else {
            clickWithCoords(el);
            await delay(300);
          }
          // ---- Wait for Select2 dropdown (usually appended to body)
          const dropdown = await waitForElement(
            'ul.select2-results__options[role="tree"], .select2-results__option, .select2-dropdown',
            1200
          );
          const values = splitMultiValues(valStr).map(v => v.trim()).filter(Boolean);
          if (!values.length) return false;
          console.log('raw value:',valStr);
          console.log('The values are going to fill are:',values);
          if (dropdown) {
            const options = [...dropdown.querySelectorAll(
              'li.select2-results__option[role="treeitem"], li[role="treeitem"], .select2-results__option'
            )].filter(opt =>
              !opt.classList.contains('select2-results__option--disabled') &&
              opt.getAttribute('aria-disabled') !== 'true' &&
              (opt.textContent || '').trim().length > 0
            );
            for (const v of values){
              const want = normalizeFieldNameWithSpace(v);
              //let target =
                //options.find(o => normalizeFieldNameWithSpace(o.textContent) === want) ||
                //options.find(o => normalizeFieldNameWithSpace(o.textContent).includes(want));
              const matchingOption = pickBestDropdownOption(options,want);
              let target = matchingOption?.raw;
              if (target) {
                console.log('Select2 target found:', target.textContent);
                clickWithCoords(target);
                await delay(300);
              }
            }               
            didSelect = true;
            return true;
          }
          // Close Select2 before fallback
          document.body.click();
        }   
      }
      if (isSmartRecruitersHost) {
        const ok = await  srSplTypeAndSelect(el, valStr);
        if (ok) return true;
      }
      /*
      let list; 
      // for icims->ul[role = "listbox] and options are li and [role="option"]
      if(!list){
        list = document.querySelector('[role="listbox"], ul[role="menu"], .MuiAutocomplete-popper, .ant-select-dropdown, .rc-virtual-list-holder'); 
      } */
      if (!didSelect) {
        let list;

        // click the anchor once
        try { el.click(); } catch {}
        await delay(120);

        if (isSuccessEuHost) {
          console.log('successEu host HumanName:', humanName);

          const hn = normalizeFieldNameWithSpace(humanName);
          const shouldType =
            hn === 'country' || hn.includes('country') ||
            hn === 'major'   || hn.includes('major');

          // 1) Find combobox wrapper and ensure expanded
          const combo =
            el.closest?.('[role="combobox"]') ||
            el.closest?.('[aria-expanded]') ||
            el;

          const isExpanded = () => {
            const v = combo?.getAttribute?.('aria-expanded');
            return v === 'true';
          };

          if (!isExpanded()) {
            // one more try (some UIs need focus+click)
            try { combo.focus?.(); } catch {}
            try { combo.click?.(); } catch {}
            await delay(120);
           
          }

          // 2) Get listbox
          list = await waitForElement('ul[role="listbox"], [role="listbox"]', 900);
          if (!list) list = await waitForNearestListbox(el, 1200, 900);
          if (!list) return false;

          // 3) Type only when expanded (and only for certain fields)
          if (shouldType && isExpanded()) {
            let input =
              (list?.id && document.querySelector(`input[aria-controls="${CSS.escape(list.id)}"]`)) ||
              findComboInputFromAnchor(el) ||
              el;

            try { input.scrollIntoView?.({ block: 'center' }); } catch {}
            try { input.focus?.(); } catch {}
            
            await typeIntoComboInputForSuccessEu(input, valStr, list);
            //await typeIntoComboInput(input, valStr);


            // 4) Wait for options to appear/update (instead of 5s sleep)
            const start = Date.now();
            while (Date.now() - start < 1200) {
              const opts = [...list.querySelectorAll('[role="option"], li, div')]
                .map(o => normalizeFieldNameWithSpace(o.textContent || ""))
                .filter(Boolean);

              // if anything exists, or if something matches loosely, break early
              if (opts.length > 0) break;
              await delay(60);
            }
          }

          // 5) Re-fetch list if it re-rendered
          if (!list || !list.isConnected) {
            list = await waitForElement('ul[role="listbox"], [role="listbox"]', 900);
            if (!list) list = await waitForNearestListbox(el, 1200, 900);
          }
          if (!list) return false;

          const picked = await scanAndSelectOption(list, valStr, { humanName });
          if (picked) return true;
        }

        console.log('Next after successeuhost');
        if(isMetaHost && !list && /\bdegree\b/i.test(humanName)){
          console.log('Entered into metahost degree input')
          await delay(80);
          list = await waitForElement('ul[role="listbox"], [role="listbox"]', 900);
          if (!list) list = await waitForNearestListbox(el, 1200, 900);
          if (!list) return false;
          const start = Date.now();
          let options;
          while (Date.now() - start < 1200) {
            options = [...list.querySelectorAll('[role="option"], li, div')]
              //.map(o => normalizeFieldNameWithSpace(o.textContent || ""))
              .filter(Boolean);
            // if anything exists, or if something matches loosely, break early
            if (options.length > 0) break;
            await delay(60);
          }
          //const getVal = (o) => normalize(o?.getAttribute?.("value"));
          const getTxt = (o) => normalize(deepTextContent(o));
          //let target =
            //options.find(o => getTxt(o) === (valStr)) ||
            //options.find(o => getTxt(o).includes(valStr));
          const matchingOption = pickBestDropdownOption(options,valStr);
          let target = matchingOption?.raw;
          //if (!target) target = options[0]; // optional: first suggestion
          if (!target) {
            console.log("SR SPL: no matching option for", valStr);
            try { document.body.click(); } catch {}
            return false;
          }

          //6) Click option
          //const okKeyboard = await selectSplOptionByKeyboard(input, valStr, 40);
          //if (okKeyboard) return true;
          console.log('the target found',target);
          const okMouse = await selectSplOptionByMouse(target);
          if (okMouse) return true;
          // last fallback: focus input + enter (some widgets select first item)
          try { input.focus?.(); } catch {}
          await sendKey(input, "Enter");
          await delay(120);
          return true;
          
        }
        if(isMetaHost && !list){
          // 1) open overlay
          //try { el.scrollIntoView?.({ block: "center" }); } catch {}
          //try { el.click?.(); } catch {}
          await delay(80);
          // 2) find search input FIRST (even if listbox doesn't exist yet)
          const input = await findSearchInputAfterClick(el, { timeoutMs: 1500 });
          console.log("Meta search input:", input);
          if (!input) return false;

          // 3) type (this should trigger the listbox/options to render)
          await typeIntoComboInputForSuccessEu(input, valStr, null);
          // 4) Wait for options to appear/update (instead of 5s sleep)
          // 4) Get listbox
          list = await waitForElement('ul[role="listbox"], [role="listbox"]', 900);
          if (!list) list = await waitForNearestListbox(el, 1200, 900);
          if (!list) return false;
          const start = Date.now();
          let options;
          while (Date.now() - start < 1200) {
            options = [...list.querySelectorAll('[role="option"], li, div')]
              //.map(o => normalizeFieldNameWithSpace(o.textContent || ""))
              .filter(Boolean);

            // if anything exists, or if something matches loosely, break early
            if (options.length > 0) break;
            await delay(60);
          }
          //const getVal = (o) => normalize(o?.getAttribute?.("value"));
          //const getTxt = (o) => normalize(deepTextContent(o));
          //let target =
            //options.find(o => getTxt(o) === (valStr)) ||
            //options.find(o => getTxt(o).includes(valStr));
          const matchingOption = pickBestDropdownOption(options,valStr);
          let target = matchingOption?.raw;
          if (!target) target = options[0]; // optional: first suggestion


          if (!target) {
            console.log("SR SPL: no matching option for", valStr);
            try { document.body.click(); } catch {}
            return false;
          }

          //6) Click option
          //const okKeyboard = await selectSplOptionByKeyboard(input, valStr, 40);
          //if (okKeyboard) return true;
          console.log('the target found',target);
          const okMouse = await selectSplOptionByMouse(target);
          if (okMouse) return true;
          // last fallback: focus input + enter (some widgets select first item)
          try { input.focus?.(); } catch {}
          await sendKey(input, "Enter");
          await delay(120);
          return true;
        }
        
        if (!list) {
          list = await waitForNearestListbox(el, 1200, 900);
          if(!list){
            list = await waitForElement('ul[role="listbox"], [role="listbox"]', 900);
          }
        }
        console.log('The list in complex:', list);
        if (!list) return false;
        const options = [...list.querySelectorAll('[role="option"], li, div')];
        console.log('In complex dropdown the options are', options);
        const best = await pickBestDropdownOption(options, valStr, { humanName });
        if (best?.raw) { clickOptionLike(best.raw); return true; }
        // fallback: close if not found
        tryClosePopup(el,list);
        document.body.click();
      }

    } 
    catch (err) { 
      console.warn('5.fillSelectElement func custom dropdown failed', err); 
    } 
    return true;
  } 
  return false;
}
//step-13, for scanning,typing the value and selecting the option
// Scrolls a (possibly virtualized) listbox to find and click the best option.
async function scanAndSelectOption(
  listbox,
  targetText,
  {
    humanName = "",
    exactFirst = true,      // Exact match first, then includes, then fuzzy
    timeout = 1500,
    typeFallback = true,
    typeFallbackTimeout = 700,
    typeEl = null,          // <-- pass the combobox input here if you have it
    collectFn = null, // ✅ NEW
  } = {}
) {
  const start = performance.now();
  let want = norm(targetText);
  
  // Ensure we start from the top
  listbox.scrollTop = 0;

  const seen = new Map(); // text -> element (last seen)

  let bestInclude = null; // { el, score, txt }
  let bestLoose = null;   // { el, score, txt }

  // Includes scoring: prefer startsWith > includes > reverse-includes
  // Tie-breakers handled in update logic below.
  const includeScore = (txt, want) => {
    if (!txt || !want) return -Infinity;
    if (txt.startsWith(want)) return 3;
    if (txt.includes(want)) return 2;
    if (want.includes(txt)) return 1;
    return -Infinity;
  };

  const betterInclude = (cand, best) => {
    if (!best) return true;
    if (cand.score !== best.score) return cand.score > best.score;
    // If same include type, prefer shorter label (usually more precise)
    if (cand.txt.length !== best.txt.length) return cand.txt.length < best.txt.length;
    // If still tied, prefer higher fuzzy
    return (cand.fz ?? 0) > (best.fz ?? 0);
  };
  /*
  // ✅ Check if we got "No Items" - early exit
  const initialOptions = collectFn ? collectFn(listbox) : collectOptionNodes(listbox);
  if (initialOptions.length === 1 && 
      norm(initialOptions[0].textContent).includes('no item')) {
    console.log(`No items found for "${targetText}" - skipping`);
    return false;
  } */
  
  while (performance.now() - start < timeout) {
    //const options = initialOptions;
    const options =  collectFn ? collectFn(listbox) : collectOptionNodes(listbox);
    for (const opt of options) {
      const txt = norm(opt.textContent);
      console.log('option in scanandselect',txt);
      if (!txt) continue;

      // Dedup by text; keep the *currently visible* element so clicks work
      seen.set(txt, opt);

      // 1) EXACT MATCH: select immediately (fast path)
      if (exactFirst && txt === want) {
        console.log("Exact match found, selecting:", txt, humanName ? `(${humanName})` : "");
        clickOptionLike(opt);
        return true;
      }

      // 2) INCLUDES MATCH: track best includes (do not click during scan)
      if (exactFirst && (txt.includes(want) || want.includes(txt))) {
        const score = includeScore(txt, want);
        // Only compute fuzzy if needed for tie-break
        const cand = { el: opt, score, txt, fz: fuzzyScore(txt, want) };
        if (betterInclude(cand, bestInclude)) bestInclude = cand;
        continue; // no need to consider this for fuzzy bestLoose
      }

      // 3) FUZZY: only if not exact and not include
      const fz = fuzzyScore(txt, want);
      if (!bestLoose || fz > bestLoose.score) bestLoose = { el: opt, score: fz, txt };
    }

    // If we’re at the bottom, break
    const atBottom = Math.ceil(listbox.scrollTop + listbox.clientHeight) >= listbox.scrollHeight;
    if (atBottom) break;

    // Scroll further down to trigger virtualization
    listbox.scrollTop = Math.min(
      listbox.scrollTop + Math.max(40, Math.floor(listbox.clientHeight * 0.9)),
      listbox.scrollHeight
    );
    await delay(80);
  }

  // 4) No exact found anywhere -> click best includes
  if (bestInclude?.el) {
    console.log("No exact match; using includes match:", bestInclude.txt, humanName ? `(${humanName})` : "");
    clickOptionLike(bestInclude.el);
    return true;
  }

  // 5) If includes not found, try semantic resolve first (using all seen labels), then fuzzy
  if (bestLoose) {
    const labels = [...seen.keys()];
    console.log("No exact/includes. Trying semantic match from labels:", labels);

    const sem = await bestOptionMatch(labels, targetText, { min: 0.62 });
    if (sem?.ok) {
      const key = norm(sem.label);
      const el =
        seen.get(key) ||
        [...seen.values()].find(o => norm(o.textContent) === key);

      if (el) {
        console.log("Semantic match picked:", key);
        clickOptionLike(el);
        return true;
      }
    }

    // fallback: click best fuzzy
    console.log("Semantic failed; clicking best fuzzy:", bestLoose.txt, bestLoose.score);
    clickOptionLike(bestLoose.el);
    return true;
  }
  // ------------------------------------------------------------
  // FALLBACK: type value -> select from visible options only
  // Priority: exact -> includes -> fuzzy (visible only)
  // ------------------------------------------------------------
  if (typeFallback && want) {
    const input = typeEl || findComboInputForListbox(listbox);

    if (input) {
      await typeIntoComboInput(input, targetText);
      await delay(80);

      const start2 = performance.now();
      while (performance.now() - start2 < typeFallbackTimeout) {
        const visibleOpts = collectVisibleOptionNodes(listbox);

        // 1) exact (visible)
        let pick = visibleOpts.find(o => norm(o.textContent) === want);

        // 2) includes (visible) if no exact
        if (!pick) {
          pick =
            visibleOpts.find(o => norm(o.textContent).includes(want)) ||
            visibleOpts.find(o => want.includes(norm(o.textContent)));
        }

        // 3) fuzzy (visible) if still nothing
        if (!pick && visibleOpts.length) {
          let best = null;
          for (const o of visibleOpts) {
            const t = norm(o.textContent);
            if (!t) continue;
            const s = fuzzyScore(t, want);
            if (!best || s > best.s) best = { o, s };
          }
          if (best && best.s >= 0.25) pick = best.o;
        }

        if (pick) {
          clickOptionLike(pick);
          return true;
        }

        // options might still be rendering
        await delay(60);
      }
    }
  }

  return false;
}
export{fillSelectElement, scanAndSelectOption}