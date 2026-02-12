import { isVisible } from "../../core/utils.js";
/* =========================
   5b) Generic company/ATS list → active-card helpers
   ========================= */
function findGenericJobListContainers(root = document) {
  const sels = [
    '[role="list"], [role="listbox"]',
    '.jobs, .jobs-list, .job-list, .posting-list, .positions-list, .careers-list',
    '.gh-application, .lever, .ashby, .workday, .icims, .smartrecruiters, .workable, .bamboohr, .successfactors',
    '.search-results, .results-list, .positions, .open-roles'
  ];
  const lists = new Set();
  sels.forEach(sel => document.querySelectorAll(sel).forEach(el => lists.add(el)));
  if (lists.size === 0) {
    const many = document.querySelectorAll('li a[href*="job"], li a[href*="careers"], li a[href*="jobs"], li a[href*="/posting"], .job-card a, .posting a');
    if (many.length >= 6) lists.add(many[0].closest('ul,ol,section,div') || document.body);
  }
  return Array.from(lists);
}

function findGenericJobCards(lists = findGenericJobListContainers()) {
  const cards = [];
  const linkSel = [
    'a[href*="jobs/"]','a[href*="/job/"]','a[href*="/careers/"]','a[href*="/posting"]','a[href*="lever.co"]',
    'a[href*="greenhouse.io"]','a[href*="myworkdayjobs"]','a[href*="icims.com"]','a[href*="ashbyhq.com"]',
    'a[href*="smartrecruiters.com"]','a[href*="apply.workable.com"]','a[href*="bamboohr.com"]','a[href*="successfactors"]'
  ].join(',');
  for (const list of lists) {
    const candidates = list.querySelectorAll('[role="option"], [role="listitem"], li, .job-card, .posting, .position, .result');
    candidates.forEach(item => {
      let a = item.querySelector(linkSel) || item.querySelector('a[href]');
      if (!a || !a.href) return;
      if (!isVisible(item)) return;
      cards.push({ item, link: a });
    });
  }
  const seen = new Set(); const out = [];
  for (const c of cards) {
    const key = c.link.href.split('#')[0];
    if (seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}

function isSelectedCard(el) {
  if (!el) return false;
  // Strong explicit states
  if (el.matches?.('[aria-selected="true"], [aria-current="true"], [aria-current="page"], .is-active, .active, .selected, .is-selected, .current')) return true;
  // Some lists mark the active item by role=option + aria-activedescendant on the listbox
  const listbox = el.closest?.('[role="listbox"], [role="list"]');
  const act = listbox?.getAttribute?.('aria-activedescendant');
  if (act) {
    const activeEl = document.getElementById(act);
    if (activeEl && (activeEl === el || activeEl.closest?.('*') === el)) return true;
  }

  // Some cards toggle expansion when selected
  const exp = el.getAttribute?.('aria-expanded');
  if (exp && /^(true|1)$/i.test(exp)) return true;

  return false;
}

// Exports
export { findGenericJobListContainers, findGenericJobCards, isSelectedCard };
