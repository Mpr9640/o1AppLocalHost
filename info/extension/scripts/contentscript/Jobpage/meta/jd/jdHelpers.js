

//# JD extraction (Schema → DOM semantics → Keyword fallback)
function cleanJDText(s) {
  let out = String(s || '');

  // normalize common unicode/whitespace
  out = out
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');

  // remove urls (keep emails)
  out = out.replace(/\b(?:(?:https?:\/\/|www\.)\S+)\b/gi, ' ');

  // remove escaped unicode + percent-encoded blobs
  out = out.replace(/\\u00[0-9a-f]{2}/gi, ' ')
           .replace(/%[0-9a-f]{2}/gi, ' ')

  // remove very long non-space tokens (tracking ids)
           .replace(/[^\s]{40,}/g, ' ')

  // collapse whitespace
           .replace(/\s{2,}/g, ' ')
           .trim();

  return out;
}

function stripLabelishLines(raw) {
  const lines = (raw || '').split(/\n+/);
  const kept = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;

    const next = (lines[i+1] || '').trim();
    const isLabelColon = /^.{1,40}:\s*$/.test(t);
    const isLabelStar  = /^.{1,40}\*\s*$/.test(t);
    const isParenOnly  = /^\([\s\S]{1,20}\)\s*$/.test(t);

    const words = t.split(/\s+/);
    const shortish = t.length <= 30 && words.length <= 4;
    const noPunct = !/[.?!,:;–—]/.test(t);
    const looksPlainWords = words.every(w => /^[A-Za-z][A-Za-z-]*$/.test(w));
    const headingOk = typeof HEADING_RE !== 'undefined' && HEADING_RE.test(t);

    // If it looks label-ish BUT the next line is a long paragraph or bullets, keep it (it's a real heading)
    const nextLooksContent = next && (next.length > 80 || /^[\s•*\-–]\s+/.test(next));

    if ((isLabelColon || isLabelStar || isParenOnly) && !nextLooksContent) continue;
    if (shortish && noPunct && looksPlainWords && !headingOk && !nextLooksContent) continue;

    kept.push(lines[i]);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function scoreJDText(t) {
  const L = t.length;
  if (L < 120 || L > 24000) return 0;

  const kw = [
    "job description","about the role","role requirements","responsibilities","requirements","qualifications",
    "skills","what you'll do","what you’ll do","what you will do","you are","what we look for","preferred qualifications",
    "minimum qualifications","must have","should have","nice to have","duties","scope","you could be a great fit if", "you need"
  ];
  let k = 0, lc = t.toLowerCase();
  for (const w of kw) if (lc.includes(w)) k++;

  const target = 4500, scale = 1200;
  const lenBonus = Math.max(0, 10 - Math.abs((L - target) / scale));
  const bullets = (t.match(/^[\s•*\-–]\s+/gm)||[]).length;
  const bulletBonus = Math.min(6, Math.floor(bullets / 10));

  return k*5 + lenBonus + bulletBonus;
}

// Exports
export { cleanJDText, stripLabelishLines, scoreJDText };

