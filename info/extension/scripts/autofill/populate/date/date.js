// scripts/autofill/populate/date/date.js

import { findOptionIndex } from '../select/helpers.js';
import { fillInput } from '../fillInput.js';

//=== Date related codes:
function parseISOish(dateStr){
  // accepts "YYYY", "YYYY-MM", "YYYY-MM-DD"
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?$/);
  if (!m) return null;
  const year  = +m[1];
  const month = m[2] ? +m[2] : null;
  const day   = m[3] ? +m[3] : null;
  //console.log('parseisoish ymd',year,month,day);
  return { year, month, day };
}
const p2 = (n)=> String(n).padStart(2,'0');

function detectSingleDateGranularity(el){
  // For single field date controls (not split month/year)
  const t   = (el.type||'').toLowerCase();
  const ph  = (el.getAttribute('placeholder')||'').toLowerCase();
  const idn = ((el.id||'') + ' ' + (el.name||'')).toLowerCase();

  if (t === 'month') return 'month-year-single';    // native <input type="month"> expects "YYYY-MM"
  if (t === 'date')  return 'date-single';          // native "YYYY-MM-DD"
  if( t==='year') return 'year-single';

  // Placeholder/ID heuristics
  if (/\bmm[\/\-]yyyy\b/.test(ph) || /\bmm[\/\-]yyyy\b/.test(idn))  return 'month-year-single';
  if (/\byyyy\b/.test(ph) || /\byear\b/.test(idn))                  return 'year-single';
  if (/\bdate\b/.test(idn) || /\bmm[\/\-]dd[\/\-]yyyy\b/.test(ph))  return 'date-single';

  return null;
}

// turn a parsed {year,month,day} into the string the field expects
function formatForGranularity(granularity, parts){
  if (!parts) return '';
  const {year, month, day} = parts;

  switch (granularity){
    case 'year-single':
      return year ? String(year) : '';
    case 'month-year-single':
      // Prefer native input[type=month] "YYYY-MM"; if the site wants "MM/YYYY" we’ll rewrite later if needed.
      if (year && month) return `${year}-${p2(month)}`;
      // If month missing, degrade to just year to avoid junk
      return year ? String(year) : '';
    case 'date-single':
      // Use safe fallback day=01 if missing
      if (year && month) return `${year}-${p2(month)}-${p2(day||1)}`;
      return year ? `${year}-01-01` : '';
    default:
      return '';
  }
}

function refineDateHumanNameAndGroup(obj){
  const el   = obj.element;
  const id   = el.id   || '';
  const name = el.name || '';
  const key  = (id + ' ' + name).toLowerCase();

  const isStart = /\b(startdate|start_date|fromdate|from_date|from|firstyearattended)\b/.test(key);
  const isEnd   = /\b(enddate|end_date|todate|to_date|to|lastyearattended)\b/.test(key);
  const side    = isStart ? 'from' : (isEnd ? 'to' : null);

  const mentionsMonth = /\bmonth\b|datesectionmonth|\bmm\b/.test(key);
  const mentionsYear  = /\byear\b|datesectionyear|\byyyy\b/.test(key);
  const mentionsDay   = /\bday\b|datesectionday|\bdd\b/.test(key);   // ⬅️ new

  const singleGran = detectSingleDateGranularity(el);
  if (side && (mentionsMonth || mentionsYear || mentionsDay)){
    const part = mentionsMonth ? 'month' : mentionsYear ? 'year' : 'day';
    obj.humanName = `${side} ${part}`;
    obj.groupId   = obj.groupId || `date:${side}`;
    obj._dateMeta = { mode: 'split', side, part };
    return;
  }

  if (side && singleGran){
    obj.humanName = `${side} ${singleGran}`;
    obj.groupId   = obj.groupId || `date:${side}`;
    obj._dateMeta = { mode: 'single', side, granularity: singleGran };
    return;
  }

  if (!side && /start|begin|from/i.test(obj.humanName||'')){
    obj._dateMeta = { mode: singleGran ? 'single':'unknown', side: 'from', granularity: singleGran||null };
    obj.groupId   = obj.groupId || `date:from`;
    return;
  }
  if (!side && /\bend|finish|to\b/i.test(obj.humanName||'')){
    obj._dateMeta = { mode: singleGran ? 'single':'unknown', side: 'to', granularity: singleGran||null };
    obj.groupId   = obj.groupId || `date:to`;
    return;
  }

  if (singleGran){
    obj._dateMeta = { mode: 'single', side: null, granularity: singleGran };
  }
}
function adaptMonthYearToPlaceholder(el, val, parts){
  const ph = (el.getAttribute('placeholder')||'').toLowerCase();
  if (!parts || !parts.year || !parts.month) return val;
  if (/\bmm[\/\-]yyyy\b/.test(ph)) return `${p2(parts.month)}/${parts.year}`;
  return val; // keep "YYYY-MM"
}
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function monthCandidates(m){
  const n = Number(m);
  if (!n || n < 1 || n > 12) return [];
  const name = MONTH_NAMES[n-1];
  return [
    String(n),                     // "3"
    String(n).padStart(2,'0'),     // "03"
    name,                          // "march"
    name.slice(0,3)                // "mar"
  ];
}
function resolveDateSource(obj){ // entry = one experience/education item
  // Prefer the metadata side, fall back to humanName hints
  const side = obj._dateMeta?.side
    || (/\b(from|start)\b/i.test(obj.humanName || '') ? 'from'
        : /\b(to|end)\b/i.test(obj.humanName || '') ? 'to' : null);

  return side;
}
async function fillDate(el, obj,value,{currentlyWorkHere=false}={}){
  //console.log('filldate datemeta',obj._dateMeta);
  // 1) Resolve ISO source
  const side = resolveDateSource(obj);
  //const iso = value;
  //console.log('filldate side and iso:',side,iso);
  if (side === 'to' && currentlyWorkHere) {
    //console.log('filDate, skipping to.. because of currently working');
    // Many pages disable/ignore end date if "currently work here" is checked
    return;
  }

  // 2) Parse parts
  //const parts = parseISOish(iso); //returns the data with split(year,month and day)
  const parts = value;
  //console.log('fillDate, splitting ymd:',parts.year,parts.month,parts.day);
  const tag = (el.tagName || '').toUpperCase();
  //const type = (el.type || '').toLowerCase();

  // 3) If we have explicit split meta (month/year pieces)
  if (obj._dateMeta?.mode === 'split'){
    if (!parts) return;
    if (obj._dateMeta.part === 'year'){
      const val = parts; //parts.year ? String(parts.year) : '';
      if (tag === 'SELECT') {
        //console.log('filldate year select tag val:',val)
        const idx = findOptionIndex(el, [String(val)]);// [String(parts.year)]);
        if (idx >= 0) { el.selectedIndex = idx; el.dispatchEvent(new Event('change', {bubbles:true})); }
        else{//console.log('fillDate skipping tag and entering regular type fill');
          await fillInput(el, val);}
      } else {
        //console.log('fillDate 2.year skipping tag and entering regular type fill');
        await fillInput(el, val);
      }
      return;
    }
    if (obj._dateMeta.part === 'month'){
      console.log('In fillDate func,Entered into the month part with value',value);
      //if (!parts.month){ /* degrade quietly if month unknown */ console.log('fillDate skipping month fill because off no value:',val); return; }
      if (tag === 'SELECT'){
        //console.log('filldate month select tag val:',val)
        const idx = findOptionIndex(el, monthCandidates(value));//monthCandidates(parts.month));
        if (idx >= 0){
          el.selectedIndex = idx;
          el.dispatchEvent(new Event('change', {bubbles:true}));
        }else{
          //console.log('fillDate 1.skipping month tag and entering regular type fill');
          await fillInput(el,String(parts).padStart(2,'0')); //String(parts.month).padStart(2,'0'));
        }
      }else{
        //console.log('fillDate 2.month skipping tag and entering regular type fill');
        await fillInput(el, String(parts).padStart(2,'0'));//String(parts.month).padStart(2,'0'));
      }
      return;
    }
    if (obj._dateMeta.part === 'day'){
      if (!parts.month){ /* degrade quietly if month unknown */ console.log('fillDate skipping day fill because off no value:',val); return; }
      if (tag === 'SELECT'){
        //console.log('filldate day select tag val:',val)
        const idx = findOptionIndex(el,parts);// parts.day);
        if (idx >= 0){
          el.selectedIndex = idx;
          el.dispatchEvent(new Event('change', {bubbles:true}));
        }else{
          //console.log('fillDate 1.skipping day tag and entering regular type fill');
          await fillInput(el, tring(parts).padStart(2,'0'));//String(parts.day).padStart(2,'0'));
        }
      }else{
        //console.log('fillDate 2.month skipping tag and entering regular type fill');
        await fillInput(el,tring(parts).padStart(2,'0')); //String(parts.day).padStart(2,'0'));
      }
      return;
    }
    

    

  }
  // 4) Single-field date
  // Detect granularity if metadata missing (defensive)
  const gran = obj._dateMeta?.granularity || detectSingleDateGranularity(el);
  let val = formatForGranularity(gran, parts);
  //console.log('filldate,gran value:',val);
  // adapt to "MM/YYYY" placeholders when it's a month-year control
  if (gran === 'month-year-single'){
    val = adaptMonthYearToPlaceholder(el, val, parts);
    //console.log('filldate,gran month-year-single value:',val);
  }

  // For <select> style "single" fields (rare), try options too
  if (tag === 'SELECT'){
    const candidates =
      gran === 'year-single'       ? [String(parts?.year || '')]
    : gran === 'month-year-single' ? (parts?.month ? monthCandidates(parts.month).map(c=>/\d{2}/.test(c)? `${c}/${parts.year}`: c) : [])
    : gran === 'date-single'       ? [val, val.replace(/-/g,'/')]
    : [val];

    const idx = findOptionIndex(el, candidates.map(s => String(s).toLowerCase()));
    if (idx >= 0){
      el.selectedIndex = idx;
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return;
    }
  }

  // 5) Default to input fill
  console.log('filldate final going for fill input with value:',val);
  await fillInput(el, val);
}
const processedDateBatches = new Set(); // separate from your processedGroups for radios/checkboxes

function batchKeyForDate(decision, obj){
  const side = obj._dateMeta?.side || 'na';
  // decision has { kind, index } like 'experience' / 2  or 'education' / 1
  if(decision.kind && decision.index){
    return `${decision.kind}:${decision.index}:${side}`
  }
  else{
    return `${decision.dataKey}:${side}`
  }
}

// gather up to 3 nearby split-date peers (day/month/year) with same groupId & side
function collectLocalSplitDatePeers(inputs, startIdx, obj){
  const side    = obj._dateMeta?.side || '';
  const groupId = obj.groupId;
  const peers = new Map(); // part -> {obj, idx}

  // scan up to 2 back and 3 forward to capture day/month/year even if order varies
  const lo = Math.max(0, startIdx - 2);
  const hi = Math.min(inputs.length - 1, startIdx + 3);

  for (let i = lo; i <= hi; i++){
    const p = inputs[i];
    if (!p || p._dateMeta?.mode !== 'split') continue;
    if (p.groupId !== groupId) continue;
    if ((p._dateMeta?.side || '') !== side) continue;

    const part = p._dateMeta.part; // 'day' | 'month' | 'year'
    if (part && !peers.has(part)) peers.set(part, { obj: p, idx: i });
    if (peers.size >= 3) break;
  }

  // order month -> year -> day (month first helps some validators)
  const order = ['month', 'year', 'day'];
  const final = order.map(k => peers.get(k)?.obj).filter(Boolean);
  print("in collectlocalsplitdatepeeres func the final value",final);
  return final;
}
function isWorkdaySplitDatePart(el) {
  if (!el || el.tagName !== 'INPUT') return false;
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (role !== 'spinbutton') return false;

  const id = (el.id || '').toLowerCase();
  // matches ids like: workExperience-4--startDate-dateSectionMonth-input
  return id.includes('datesectionmonth-input') || id.includes('datesectionyear-input');
}

function datePartBias(el) {
  const id = (el.id || '').toLowerCase();
  if (id.includes('datesectionmonth-input')) return 'left';
  if (id.includes('datesectionyear-input')) return 'right';
  return 'center';
}
export {
  parseISOish,
  p2,
  detectSingleDateGranularity,
  formatForGranularity,
  refineDateHumanNameAndGroup,
  adaptMonthYearToPlaceholder,
  MONTH_NAMES,
  monthCandidates,
  resolveDateSource,
  fillDate,
  processedDateBatches,
  batchKeyForDate,
  collectLocalSplitDatePeers,
  isWorkdaySplitDatePart,
  datePartBias
};