function getIcimsFormRoot() {
  return document.querySelector(
    '#iCIMS_ApplicantProfile, form#cp_form, form[action*="Profile"], form[action*="Candidate"], .iCIMS_ContentPane'
  ) || document;
}

function stableKeyFor(el) {
  const id = el.id || '';
  const name = el.getAttribute?.('name') || '';
  const type = el.getAttribute?.('type') || '';
  const formAct = el.form?.getAttribute?.('action') || '';
  // short DOM path fingerprint
  let n = el, path = [];
  for (let i=0; n && i<4; i++) {
    let ix = 0, sib = n;
    while ((sib = sib.previousElementSibling)) ix++;
    path.push(`${n.tagName}:${ix}`);
    n = n.parentElement;
  }
  return [id, name, type, formAct, path.join('>')].join('|');
}

export {stableKeyFor,getIcimsFormRoot};