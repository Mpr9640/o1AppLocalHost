import { normalizeFieldNameWithSpace, delay, isVisible } from '../../utils.js';

function isTextInput(el) {
  if (!el) return false;
  if (el.tagName === "INPUT" && el.type !== "hidden" && !el.disabled) return true;
  if (el.getAttribute?.("role") === "textbox" && el.getAttribute("aria-disabled") !== "true") return true;
  return false;
}

function scoreSearchInput(el) {
  const ph = (el.getAttribute("placeholder") || "").toLowerCase();
  const al = (el.getAttribute("aria-label") || "").toLowerCase();
  const ac = (el.getAttribute("aria-autocomplete") || "").toLowerCase();
  let s = 0;
  if (ac === "list") s += 5;
  if (ph.includes("search")) s += 6;
  if (al.includes("search")) s += 6;
  if (el.tagName === "INPUT") s += 2;
  if (isVisible(el)) s += 2;
  return s;
}

function snapshotVisibleTextInputs() {
  return new Set(
    [...document.querySelectorAll('input:not([type="hidden"]), [role="textbox"]')]
      .filter(isTextInput)
      .filter(isVisible)
  );
}

// ✅ Find search box without needing listbox
async function findSearchInputAfterClick(anchorEl, { timeoutMs = 1500 } = {}) {
  const before = snapshotVisibleTextInputs();

  // click already happened outside, but safe if you call inside too
  const start = performance.now();

  while (performance.now() - start < timeoutMs) {
    // 1) Focus heuristic (best case)
    const ae = document.activeElement;
    if (isTextInput(ae)) return ae;  //&& isVisible(ae)

    // 2) New-node heuristic (portal input created)
    const now = [...document.querySelectorAll('input:not([type="hidden"]), [role="textbox"]')]
      .filter(isTextInput)
      //.filter(isVisible);

    const added = now.filter(n => !before.has(n));
    if (added.length) {
      added.sort((a,b) => scoreSearchInput(b) - scoreSearchInput(a));
      return added[0];
    }

    await delay(25);
  }

  // 3) Last resort: pick best visible input in the whole document
  const all = [...document.querySelectorAll('input:not([type="hidden"]), [role="textbox"]')]
    .filter(isTextInput)
    //.filter(isVisible);

  all.sort((a,b) => scoreSearchInput(b) - scoreSearchInput(a));
  return all[0] || null;
}

function buildOptionCandidates(options) {
  const L = [];
  for (const raw of options) {
    if (!raw) continue;

    // skip containers / empty text
    const txt = normalizeFieldNameWithSpace(raw.textContent || "");
    if (!txt) continue;

    L.push({ raw, c: txt });
  }
  return L;
}
//For meta to find the location options label
function metaChoiceOptionLabel(input) {
  if (!input) return "";
  const li = input.closest('[role="listitem"]');
  const root = li || input.closest("label") || input.parentElement;
  if (!root) return "";

  // 1) Strong signal in your screenshot: text is inside this "ignore" block
  const ignoreBlock = root.querySelector('[data-ssccoverage-ignore="true"]');
  if (ignoreBlock) {
    const t = (ignoreBlock.textContent || "").replace(/\s+/g, " ").trim();
    if (t) return t;
  }

  // 2) Fallback: derive visible label text from the listitem,
  // stripping control/UI noise (input/svg/buttons/icons)
  const clone = root.cloneNode(true);
  clone.querySelectorAll(
    "input, svg, button, [role='img'], [aria-hidden='true']"
  ).forEach(n => n.remove());

  const t = (clone.textContent || "").replace(/\s+/g, " ").trim();
  return t;
}


export {
  isTextInput,
  scoreSearchInput,
  snapshotVisibleTextInputs,
  findSearchInputAfterClick,
  buildOptionCandidates,
  metaChoiceOptionLabel
};
