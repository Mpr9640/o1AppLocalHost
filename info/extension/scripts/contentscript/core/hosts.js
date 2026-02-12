//# starting: Defining all Hosts 
const ATS_HOST_MAP = [
  /greenhouse\.io|boards\.greenhouse\.io/i, /lever\.co/i,
  /myworkdayjobs\.com|workday\.com/i, /icims\.com/i, /taleo\.net/i,/successfactors\.eu/i,
  /ashbyhq\.com/i, /smartrecruiters\.com/i, /smartrecruiterscareers\.com/i, /workable\.com/i,
  /bamboohr\.com/i, /jobvite\.com/i, /successfactors\.com/i,/metacareers\.com/i,/paylocity\.com/i,/careers-page\.com/i,
];
const KNOWN_JOB_HOSTS = [
  /(^|\.)linkedin\.com$/i, /indeed\.com/i, /dice\.com/i, /glassdoor\.com/i,
  /monster\.com/i, /careerbuilder\.com/i, /jobright\.ai/i, ...ATS_HOST_MAP
];
/* Negative & hard-block guards */
const NEGATIVE_HOSTS = [
  /github\.com$/i, /stackoverflow\.com$/i,/localhost/i,
  /mail\.google\.com$/i, /calendar\.google\.com$/i, /notion\.so$/i,
  /confluence\./i, /slack\.com$/i, /teams\.microsoft\.com$/i
];
const HARD_BLOCK_HOSTS = [
  /(^|\.)chatgpt\.com$/i, // blocks ChatGPT and any openai.com subdomain
];
const SEARCH_ENGINE_HOSTS = [/google\./i, /bing\.com/i, /duckduckgo\.com/i, /search\.yahoo\.com/i, /ecosia\.org/i];
const LI_NEGATIVE_PATH = [/^\/feed/i, /^\/messaging/i, /^\/notifications/i, /^\/in\//i, /^\/people\//i, /^\/sales\//i, /^\/learning\//i];
const isGreenhouseHost = /(?:^|\.)greenhouse\.io$/i.test(location.hostname);
const isAshbyHost = /(?:^|\.)ashbyhq\.com$/i.test(location.hostname);
const isIcimsHost = /(?:^|\.)icims\.com$/i.test(location.hostname);
const isTaleoHost = /(?:^|\.)taleo\.net$/i.test(location.hostname);
function isIndeedHost() {
  return /(^|\.)indeed\./i.test(location.hostname);
}
function isWorkdayHost() {
  return /(^|\.)myworkdayjobs\.com$/i.test(location.hostname)
      || /(^|\.)workday\.com$/i.test(location.hostname);
}
function isWorkableHost() {
  return /(^|\.)workable\.com$/i.test(location.hostname);
}
function isJobsViteHost() {
  return /(^|\.)jobvite\.com$/i.test(location.hostname);
}
function isEyHost() {
  return /(^|\.)ey\.com$/i.test(location.hostname);
  
}
function isMetaHost(){
  return /(^|\.)metacareers\.com$/i.test(location.hostname);
}
function isGlassDoorHost(){
  return /(^|\.)glassdoor\.com$/i.test(location.hostname);
}
const hostMatches = (arr) => arr.some(rx => rx.test(location.hostname));
const isSearchEngineHost = () => hostMatches(SEARCH_ENGINE_HOSTS);
const isKnownJobHost = () => hostMatches(KNOWN_JOB_HOSTS);
const isAtsHost = () => hostMatches(ATS_HOST_MAP);
const isLinkedInHost = () => /(^|\.)linkedin\.com$/i.test(location.hostname);
const isNegativeHost = () => hostMatches(NEGATIVE_HOSTS);
const isHardBlockedHost = () => hostMatches(HARD_BLOCK_HOSTS);

// Exports
export {
  ATS_HOST_MAP, KNOWN_JOB_HOSTS, NEGATIVE_HOSTS, HARD_BLOCK_HOSTS, SEARCH_ENGINE_HOSTS, LI_NEGATIVE_PATH,
  isGreenhouseHost, isAshbyHost, isIcimsHost, isTaleoHost, isIndeedHost, isWorkdayHost, isWorkableHost,
  isJobsViteHost, isEyHost, isMetaHost, isGlassDoorHost,
  hostMatches, isSearchEngineHost, isKnownJobHost, isAtsHost, isLinkedInHost,
  isNegativeHost, isHardBlockedHost
};
