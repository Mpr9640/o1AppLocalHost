import { safeURL } from "../core/utils.js";

//1. workday, ashby and greenhouse. (oracle.cloud)needs to fix
const URL_KEYWORDS = ['apply','application','job','jobs','career','careers','hiring','employment','positions','form'];

//# 0b) URL & list/grid helpers
// 1.Working codes to find JOb pages.
function urlHints() {
  try {
    //const u = new URL(location.href);
    const u = safeURL(location.href) || { pathname: "", search: "" };
    const path = (u.pathname + ' ' + u.search).toLowerCase();
    let hits = 0;
    for (const k of URL_KEYWORDS) {
      const re = new RegExp(`(^|[\\W_])${k}([\\W_]|$)`, 'i');
      if (re.test(path)){
        hits++;
        break;
      }
    }
    return hits;
  } catch { return 0; }
}

function looksLikeGrid(root = document) {
  const cards = root.querySelectorAll(
    '[data-occludable-job-id],[data-job-id],[data-jk],.job-card,.jobs-search-results__list-item,.tapItem,.job_seen_beacon'
  );
  return cards.length > 12 && !hasApplySignals();
}

function hasApplySignals() {
  const strongBtn = Array.from(document.querySelectorAll('a,button,input[type=submit]'))
      .some(el => /apply(?:\s|$)|submit application|send application|begin application|start application|apply now/i
          .test((el.textContent||el.value||'').trim()));
  if (strongBtn) return true;
  if (document.querySelector('input[type="file"], input[name*="resume" i], input[name*="cv" i], input[name*="file" i]')) return true;
  const labelish = /(first|last)\s*name|email|phone|address|resume|cv|linkedin|portfolio|cover\s*letter|location/i;

  const forms = Array.from(document.querySelectorAll('form'))
      .filter(f => !/search|filter|newsletter/i.test(
          (f.getAttribute('id')||'') + ' ' + (f.getAttribute('name')||'') + ' ' + (f.className||'')
      ));

  const hasCandidateForm = forms.some(f => {
      const inputs = f.querySelectorAll('input,select,textarea');
      if (inputs.length < 1) return false;
      const text = (f.innerText||'').slice(0, 1200);
      return labelish.test(text);
  });
  
  if (hasCandidateForm) return true;
  const allCandidateInputs = document.querySelectorAll('input,select,textarea');
  if (allCandidateInputs.length > 1) {
      // Check the text surrounding the inputs for application labels
      const inputsTextContext = (document.body?.innerText || '').slice(0, 4000); 
      
      if (labelish.test(inputsTextContext)) {
          return true;
      }
  }

  return false; // If none of the four signals are met.
}

//#  detect auth/stepper/confirmation-like pages to suppress JD extraction
function looksLikeAuthOrStepper() {
  // Workday stepper / auth / application wizard
  //const stepper = document.querySelector('[data-automation-id*="stepper" i], .wd-step, .progress-tracker, .application-steps, .wizardSteps, .stepper');
  const authWords = /(create\s*account|log\s*in|sign\s*in|sign\s*up|authentication|verify\s*email|password)/i;
  //const hasAuthText = authWords.test((document.body.innerText || '').slice(0, 4000));
  const hasAuthUrl = authWords.test((location.href));
  //const heavyForm = document.querySelector('form') && document.querySelectorAll('input,select,textarea').length > 10;
  //return !!(stepper || (heavyForm && hasAuthText));
  return !!(hasAuthUrl);
}

// Exports
export { URL_KEYWORDS, urlHints, looksLikeGrid, hasApplySignals, looksLikeAuthOrStepper };
