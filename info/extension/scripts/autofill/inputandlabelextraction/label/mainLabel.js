import {
  normalizeFieldNameWithSpace,
  stripRequiredAsterisk,

  // host flags used in this file
  isWorkableJobsHost,
  isApplyWorkableHost,
  isSmartRecruitersHost,
  isLeverHost,
  isIcimsHost,
  isPowerHost,
  isWorkdayHost
} from '../../utils.js';

import {
  nearestTextAround,
  looksMachineName,
  leverQuestionTextFor,
  smartRecruitersFileLabelFor,
} from './helpers.js';

import { fieldNameCache } from '../helpers.js';

import {
  FILE_POS_KW_RE,
  FILE_NEG_KW_RE,
  FILE_SIZE_HINT_RE,
  isFileField,
  stripFileCtas,
  findFileFieldName,
  dropContainerNoise,
} from '../../resume/helpers.js';


function inputFieldSelection(field){
  if (!field) return '';
  if (fieldNameCache.has(field)) return fieldNameCache.get(field);

  const doc = field.ownerDocument || document;
  const isWorkable = typeof isWorkableJobsHost !== 'undefined' && isWorkableJobsHost;
  const isSmartRecruiters = typeof isSmartRecruitersHost !== 'undefined' && isSmartRecruitersHost;

  const clean = (s) => {
    if (!s) return '';
    let t = (s || '').trim();
    if (field.value) t = t.replace(field.value, '').trim();
    //if (field.placeholder) t = t.replace(field.placeholder, '').trim();
    //Chaning the syntax to make it convinient for power host domain
    const ph = (field.placeholder || '').trim();
    if (ph && (!isPowerHost || (s || '').trim() !== ph)) {
      t = t.replace(field.placeholder, '').trim();
    }
    t = stripRequiredAsterisk(t);
    t = dropContainerNoise(t);
    return normalizeFieldNameWithSpace(t);
  };

  const inFieldset = () => {
    const fs = field.closest('fieldset');
    if (!fs) return '';
    const legend = fs.querySelector('legend');
    if (legend?.textContent) return clean(legend.textContent);
    const lab = fs.querySelector(':scope > label');
    if (lab?.textContent) return clean(lab.textContent);
    return '';
  };

  const labelAssoc = () => {
    if (field.id) {
      const lab = doc.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (lab?.textContent) return clean(lab.textContent);
    }
    let el = field;
    while (el && el !== doc.body) {
      if (el.tagName === 'LABEL') return clean(el.textContent);
      if (el.parentNode?.tagName === 'LABEL') return clean(el.parentNode.textContent);
      let prev = el.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'LABEL') return clean(prev.textContent);
        prev = prev.previousElementSibling;
      }
      el = el.parentNode;
    }
    return '';
  };

  const ariaLabels = () => {
    if (field.hasAttribute('aria-label')) return clean(field.getAttribute('aria-label'));
    if (field.hasAttribute('aria-labelledby')) {
      const ids = field.getAttribute('aria-labelledby').split(/\s+/);
      const txt = ids
        .map(id => doc.getElementById(id)?.textContent || '')
        .join(' ');
      if (txt.trim()) return clean(txt);
    }
    return '';
  };

  const inContainers = () => {
    if (isLeverHost) {
      const q = leverQuestionTextFor(field);
      if (q) return clean(q);
    }
    let el = field;
    while (el && el !== doc.body) {
      const p = el.parentNode;
      if (p && ['DIV','SECTION','SPAN','TD','TH','LI','P'].includes(p.tagName)) {
        const txt = dropContainerNoise((p.textContent || '').trim());
        if (txt) return clean(txt);
      }
      let prev = el.previousElementSibling;
      while (prev) {
        if (['DIV','SECTION','SPAN','TD','TH','LI','P'].includes(prev.tagName)) {
          const txt = dropContainerNoise((prev.textContent || '').trim());
          if (txt) return clean(txt);
        }
        prev = prev.previousElementSibling;
      }
      el = el.parentNode;
    }
    return '';
  };

  // iCIMS <select> helper (Q6/Q9…)
  const icimsSelectQuestionText = () => {
    if (!(typeof isIcimsHost !== 'undefined' && isIcimsHost)) return '';
    if (field.tagName !== 'SELECT') return '';
    const id = field.id;
    if (!id) return '';

    const qRoot = doc.querySelector(`#${CSS.escape(id)}_questionText`);
    if (!qRoot) return '';
    const labelEl =
      qRoot.querySelector('label') ||
      qRoot.querySelector('.iCIMS_LabelText') ||
      qRoot;
    const txt = labelEl?.textContent || '';
    return clean(txt);
  };

  // ===== Workable: radio / checkbox question text =====
  const workableQuestionTextFor = () => {
    if (!isWorkable || !isApplyWorkableHost) return '';
    const fs = field.closest('fieldset[role="radiogroup"], fieldset');
    if (!fs) return '';

    let txt = '';
    const ariaId = fs.getAttribute('aria-labelledby');
    if (ariaId) {
      const labelEl = doc.getElementById(ariaId);
      if (labelEl) txt = labelEl.textContent || '';
    }

    // Fallback: look in parent container for label-ish text
    if (!txt) {
      const container = fs.parentElement;
      if (container) {
        const labelLike =
          container.querySelector('[data-ui="label"]') ||
          container.querySelector('[id$="_label"]') ||
          container.querySelector('[class*="label"]');
        if (labelLike) txt = labelLike.textContent || '';
      }
    }

    return clean(txt);
  };

  // ===== SmartRecruiters: checkbox label text =====
  const smartRecruitersCheckboxLabelFor = () => {
    if (!isSmartRecruiters) return '';

    // Field is inside a shadow root; climb to the host (oc-checkbox / spl-checkbox)
    let host = null;
    const rootNode = field.getRootNode && field.getRootNode();
    if (rootNode && rootNode.host) host = rootNode.host;

    let scope =
      (host && host.closest && host.closest('label')) ||
      host ||
      (field.closest && field.closest('label')) ||
      (field.closest && field.closest('[data-test*="checkbox"]'));

    if (!scope) scope = doc;

    let labelSpan =
      scope.querySelector('[data-test="checkbox-label"]') ||
      scope.querySelector('[slot="label-content"]') ||
      scope.querySelector('[data-test="label"]');

    let txt = labelSpan?.textContent || '';

    if (!txt && field.hasAttribute('aria-labelledby')) {
      const ariaId = field.getAttribute('aria-labelledby');
      const el = ariaId ? doc.getElementById(ariaId) : null;
      if (el) txt = el.textContent || '';
    }

    return clean(txt);
  };

  // ---------- resolution order ----------
  let name = '';
  const t = (field.type || '').toLowerCase();
  const tag = field.tagName;

  // --- HOST-SPECIFIC FIRST ---
  if(isApplyWorkableHost && t === 'file'){
    name = field.getAttribute('data-ui') 
    if(!name){
      const id = field.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        name = label ? label.textContent.trim() : '';
      }
    }
  }
  // Workable radios/checkboxes → use radiogroup question text
  if (!name && (isWorkable) && (t === 'checkbox' || t === 'radio')) {
    name = workableQuestionTextFor();
  }
  if (!name && (isApplyWorkableHost) && (t === 'checkbox' || t === 'radio')) {
    name = clean(field.name);
  }

  // SmartRecruiters checkboxes → use checkbox label slot/content
  if (!name && isSmartRecruiters && t === 'checkbox') {
    name = smartRecruitersCheckboxLabelFor();
  }

  // Generic radios/checkboxes (fieldset/label/container)
  if (!name && (t === 'checkbox' || t === 'radio')) {
    name = inFieldset() || labelAssoc() || inContainers();
  }

  // Lever hard preference
  if (!name && isLeverHost) {
    const leverQ = leverQuestionTextFor(field);
    if (leverQ) name = clean(leverQ);
  }

  // iCIMS <select> BEFORE generic label/aria
  if (!name &&
      typeof isIcimsHost !== 'undefined' &&
      isIcimsHost &&
      tag === 'SELECT') {
    name = icimsSelectQuestionText();
  }
    //POwerhost is mostly using placeholders except checkbox,files
  if(isPowerHost && field.placeholder){
    name = clean(field.placeholder);
  }
  //We are adding this because it is not extracing the correct humanname for workday 3rd page selct inputs.
  if(!name && isWorkdayHost()){
    name = inFieldset();
  }
  if(!name && isIcimsHost && t === 'file'){
    name = clean(field.name);
  }
  // SmartRecruiters file inputs → use section title ("Resume", "Cover letter", etc.)
  if (!name && isSmartRecruiters && t === 'file') {
    const srFile = smartRecruitersFileLabelFor(field);
    if (srFile) name = clean(srFile);
  }
  if (!name) name = labelAssoc();
  if (!name) name = ariaLabels();
  // de-prioritize ugly machine names
  if (!name && field.name && !looksMachineName(field.name)) {
    name = clean(field.name);
  }
  if (!name && field.title) name = clean(field.title);
  if (!name) name = inFieldset() || inContainers();
  if (!name && field.placeholder) name = clean(field.placeholder);
  if (!name) name = nearestTextAround(field);  // if this uses document, you may also adapt it to use `doc`.

  // ---------- file input post-processing ----------
  if (isFileField(field)) {
    const cleaned = stripFileCtas ? stripFileCtas(name) : name;
    if (FILE_POS_KW_RE?.test?.(cleaned)) {
      const finalName = normalizeFieldNameWithSpace(cleaned);
      fieldNameCache.set(field, finalName);
      return finalName;
    }
    if (!cleaned || FILE_NEG_KW_RE?.test?.(cleaned) || FILE_SIZE_HINT_RE?.test?.(cleaned)) {
      const hopName = findFileFieldName ? findFileFieldName(field, 6) : '';
      if (hopName) {
        fieldNameCache.set(field, hopName);
        return hopName;
      }
    }
    name = cleaned || name;
    console.log('1. inputfieldselection func humanname for file:', name);
  }

  const out = name || '';
  fieldNameCache.set(field, out);
  return out;
}
export{inputFieldSelection};
