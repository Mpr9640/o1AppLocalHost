const fieldMappings = [
  // ==== PERSONAL INFO ====
  { keywords: [/\bfirst\s*name\b/i, /\bgiven\s*name\b/i], dataKey: 'firstname' },
  { keywords: [/\bmiddle\s*name\b/i, /\binitial\b/i], dataKey: 'middlename' },
  { keywords: [/\blast\s*name\b/i, /\bsurname\b/i, /\bfamily\s*name\b/i], dataKey: 'lastname' },
  { keywords: [/\bfull\s*name\b/i, /\blegal\s*name\b/i,/^name$/i], dataKey: 'fullname' },
  // ==== CONTACT INFO ====
  { keywords: [/\bemail\b/i, /\bemail\s*address\b/i], dataKey: 'email' },
  { keywords: [/\b(?:phone|mobile|telephone|contact\s*number)\b(?!\s*(extension|type)\b)/i], dataKey: 'phonenumber' },
  { keywords: [/\b(country\s*code|phone\s*code)\b/i], dataKey: 'residencecountry', handleCountryCode: true },
  { keywords: [/\bdate\s*of\s*birth\b/i, /\bdob\b/i, /\bbirth\s*date\b/i], dataKey: 'dateofbirth', type:'date' },

  // ==== SOCIAL / LINKS ====
  { keywords: [/\blinked\s?in\b/i, /\blinked\s*in\s*profile\b/i], dataKey: 'linkedin' },
  { keywords: [/\bgit\s?hub\b/i, /\bgithub\s*profile\b/i], dataKey: 'github' },
  { keywords: [/\bportfolio\b/i, /\bpersonal\s*site\b/i], dataKey: 'portfolio' },
  { keywords: [/\bskills\b/i], dataKey: 'skills'},

  // ==== FILE UPLOADS ====
  { keywords: [/\bresume\b/i, /\bcv\b/i, /\bcurriculum\s*vitae\b/i], dataKey: 'resume' },
  { keywords: [/\bcover\s*letter\b/i, /\bsupporting\s*document\b/i], dataKey: 'coverletter' },

  // ==== DEMOGRAPHIC INFO ====
  { keywords: [/\bgender\b/i, /\bsex\b/i], dataKey: 'gender' },
  { keywords: [/\brace\b/i, /\bethnicity\b/i, /\bethnic\s*group\b/i], dataKey: 'race' },
  { keywords: [/\bdisab(?:ility|led)?\b/i, /\bdisclosure of disability\b/i], dataKey: 'disability' },
  { keywords: [/\bveteran\b/i, /\bmilitary\b/i, /\barmed\s*forces\b/i], dataKey: 'veteran' },
  { keywords: [/\bsponsor|spsorship|sponsorship/i, /\bvisa\s*sponsor\b/i, /\bwork\s*authorization\b/i], dataKey: 'needsponsorship' },

  // residence address / address line 1 / address number / street number — prefix required
  {keywords: [/\b(?:residence|residential|street|postal|permanent|home)[-\s]*address\b(?!\s*line\s*2\b)(?:\s*(?:line\s*1|number(?:\s*\d+)?))?/i,/\b(?:residence|residential|permanent|present|current|home)[-\s]*street[-\s]*number\b/i],dataKey: 'residenceaddress'},
  {keywords: [/\b(?:residence|residential|permanent|present|current|home)[-\s]*(?:city|town)\b/i],dataKey: 'residencecity'},
  {keywords: [/\b(?:residence|residential|permanent|present|current|home)[-\s]*state\b(?!\s*of\b)/i],dataKey: 'residencestate'},
  {keywords: [/\b(?:residence|residential|permanent|present|current|home)[-\s]*country\b(?!\s*(?:code|dial|calling)\b)/i],dataKey: 'residencecountry'},
  {keywords: [/\b(?:residence|residential|permanent|present|current|home)[-\s]*(?:zip|postal|area)[-\s]*code\b/i],dataKey: 'residencezipcode'},
  {keywords: [/\b(?:residence|residential|permanent|present|current|home|currently)[-\s]*(location|located)\b/i],dataKey: 'residencelocation'}
];
// ===================== NEGATIVE / POSITIVE RULES =====================
// NOTE: single-line regex literals (no syntax errors)

const NEG_NAME =
  /\b(employer|company|organization|business|vendor|client|customer|manager|supervisor|recruiter|hr|interviewer|reference|referee|emergency|contact\s*person|parent|guardian|spouse|school|university|college|bank|account|beneficiary)\b/i;
const NEG_EMAIL =
  /\b(employer|company|organization|business|manager|supervisor|recruiter|hr|reference|referee|emergency|contact\s*person)\b/i;

const NEG_PHONE =
  /\b(employer|company|organization|business|work|office|desk|manager|supervisor|recruiter|hr|reference|referee|emergency|contact\s*person|extension|ext\.?)\b/i;

const NEG_DOB =
  /\b(dependent|child|spouse|parent|guardian)\b/i;

// Strict-positive for country code (prevents matching generic "country")
const POS_COUNTRY_CODE =
  /\b(country\s*code|phone\s*code|dial(ing)?\s*code|calling\s*code)\b/i;


// ===================== HELPERS =====================
function hasNegatives(label, dataKey) {
  const t = (label || "").toLowerCase();

  // user-requested simplification: use NEG_NAME for any key containing "name"
  if ((dataKey || "").includes('name')) return NEG_NAME.test(t);

  if (dataKey === 'email') return NEG_EMAIL.test(t);
  if (dataKey === 'phonenumber') return NEG_PHONE.test(t);
  if (dataKey === 'dateofbirth') return NEG_DOB.test(t);

  return false;
}
// =====================
// Repeated section discovery (Add buttons, titles)
//EDUCATION =====
const eduMappings = [
  { keywords:[/\b(school|college|university)\s*(?:name)?\b/i],     dataKey:'educations[x].school' },
  { keywords:[/\bdegree\b/i],                                       dataKey:'educations[x].degree' },
  { keywords:[/\b(major|field\s*of\s*study|discipline|course|course\s*of\s*study)\b/i], dataKey:'educations[x].major' },
  { keywords:[/\b(cgpa|gpa)\b/i],                                   dataKey:'educations[x].cgpa' },
  { keywords:[/\bcurrently\s*studying|present\b/i],                 dataKey:'educations[x].currently_studying' },
];

// ===== EXPERIENCE =====
const expMappings = [
  { keywords:[/\b(company|employer|organization)\s*(?:name)?\b/i], dataKey:'experiences[x].company_name' },
  { keywords:[/\b(job|role|position)\b(?!(\s*description))\s*(?:(title|name))?\b/i],     dataKey:'experiences[x].job_name' },
  { keywords:[/\bcurrently\s*(work|working)|present\b/i],                 dataKey:'experiences[x].currently_working' },
  { keywords:[/\b(duties|responsibilities|description)\b/i],       dataKey:'experiences[x].job_duties' },
];

// ===== SHARED ADDRESS (dynamic prefix for repeated sections) =====
const addressMappings = [
  { keywords:[/\b(start\s*date|from|start)\b/i],                    dataKey:'{prefix}[x].start_date', type:'date' },
  { keywords:[/\bend\s*date|graduation\s*date|to|end\b/i],          dataKey:'{prefix}[x].end_date',   type:'date' },
  { keywords:[/(?:(?<!e[-\s]?mail\s*)\b(?:(?:employer|working)\s*)?address\b(?!\s*line\s*2\b)(?:\s*(?:line\s*1|number(?:\s*\d+)?))?|\bstreet\s*number\b)/i], dataKey:'{prefix}[x].address' },
  { keywords:[/\b(?:(?:employer|working|school|university|job|company)\s*)?(city|town)\b/i], dataKey:'{prefix}[x].city' },
  { keywords:[/\b(?:(?:employer|working|school|university|job|company)\s*)?state\b(?!\s*of\b)/i], dataKey:'{prefix}[x].state' },
  { keywords:[/\b(?:(?:employer|working|school|university|job|company)\s*)?zip(?:\s*code)?\b/i], dataKey:'{prefix}[x].zip_code' },
  { keywords:[/\b(?:(?:employer|working|school|university|job|company)\s*)?country\b(?!\s*(?:code|dial|calling)\b)/i], dataKey:'{prefix}[x].country' },
  { keywords:[/\b(?:(?:employer|working|school|university|job|company)\s*)?location\b/i],dataKey:'{prefix}[x].location', type:'combine'},
];

const resMappings = [
    // ==== CONTACT ADDRESS (root/residence) ====
  { keywords: [/(?:(?<!e[-\s]?mail\s*)\b(?:(?:residence|residential|street|postal|permanent|home)\s*)?address\b(?!\s*line\s*2\b)(?:\s*(?:line\s*1|number(?:\s*\d+)?))?|\bstreet\s*number\b)/i], dataKey: 'residenceaddress' },
  { keywords: [/\b(?:(?:residence|residential|permanent|present|current|home)\s*)?(?:city|town)\b/i], dataKey: 'residencecity' },
  { keywords: [/\b(?:(?:residence|residential|permanent|present|current|home)\s*)?state\b(?!\s*of\b)/i], dataKey: 'residencestate' },
  { keywords: [/\b(?:(?:residence|residential|permanent|present|current|home)\s*)?country\b(?!\s*(?:code|dial|calling)\b)/i], dataKey: 'residencecountry' },
  //{ keywords: [/\b(?:(?:residence|residential|permanent|present|current|home)\s*)(?:zip|postal|area)\s*code\b/i], dataKey: 'residencezipcode'},
  {keywords: [/\b(?:(?:residence|residential|permanent|present|current|home)\s*)?(?:zip|postal|area)\s*code\b/i], dataKey: 'residencezipcode'},
  { keywords: [/\b(?:(?:residence|residential|permanent|present|current|home)\s*)?(?:location)\b/i], dataKey: 'residencelocation' }
]
export{fieldMappings,NEG_NAME, NEG_EMAIL, NEG_PHONE, NEG_DOB,POS_COUNTRY_CODE,hasNegatives,eduMappings,expMappings,addressMappings,resMappings}