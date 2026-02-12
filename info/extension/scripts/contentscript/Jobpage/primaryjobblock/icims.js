//# 0d) Primary job block selector for icims
function selectPrimaryJobBlock(doc = document) {
  const $$ = (s, r = doc) => Array.from(r.querySelectorAll(s));
  const visible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const CANDIDATES = [
    'main', '#main', '[role="main"]',
    '#iCIMS_JobContent', '.iCIMS_JobContent', '.iCIMS_JobDescription', '.iCIMS_JobHeader',
    '.iCIMS_Profile', '.iCIMS_CandidateProfile', '.iCIMS_Application', '.iCIMS_Apply',
    '.iCIMS_Content', '.icims-portal', '.application-container', '#overview',
    '.job-details', '.job', '.job-application', '.application',
    '.wizard', '.stepper', '.progress-tracker', '.application-steps', '.wizardSteps'
  ].join(',');

  const hasTitle = (root) => !!root.querySelector('h1,h2,[role="heading"]');
  const longText = (root) => ((root.textContent || '').replace(/\s+/g,' ').length > 500);
  const applySignals = (root) => {
    const inputs = root.querySelectorAll('input,select,textarea');
    const stepper = root.querySelector('[data-automation-id*="stepper" i], .wd-step, .progress-tracker, .application-steps, .wizardSteps, .stepper');
    const btn = Array.from(root.querySelectorAll('a,button,input[type=submit]')).some(el =>
      /apply|begin application|start application|continue|next|submit/i.test((el.textContent || el.value || '').trim())
    );
    return inputs.length >= 6 || !!stepper || !!btn;
  };

  const blocks = $$(CANDIDATES).filter(visible);
  if (!blocks.length) return null;

  const topMost = blocks.filter(el => !blocks.some(o => o !== el && o.contains(el)));
  if (!topMost.length) return null;

  function score(el) {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    const jdLike = (hasTitle(el) && longText(el)) ? 2 : 0;
    const applLike = applySignals(el) ? 1 : 0;
    return { jdLike, applLike, area, top: r.top || 0 };
  }

  topMost.sort((a,b) => {
    const sa = score(a), sb = score(b);
    if (sa.jdLike !== sb.jdLike) return sb.jdLike - sa.jdLike;
    if (sa.applLike !== sb.applLike) return sb.applLike - sa.applLike;
    if (sa.area !== sb.area) return sb.area - sa.area;
    return sa.top - sb.top;
  });

  const best = topMost[0];
  const s = score(best);
  return (s.jdLike || s.applLike) ? best : null;
}

// Exports
export { selectPrimaryJobBlock };
