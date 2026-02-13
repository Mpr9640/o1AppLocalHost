import {timeout} from "../core/utils.js";
import {apiClient} from "../../background.js";
import {
  getUserSkillsSet,
  fuzzyMatch,
} from '../../scripts/skillmatching.js';
import { extractSkillsHybrid } from './skillsExtraction.js';
function percent(m,t){ return t? (m/t)*100 : 0; }
function matchJDToUser(jobSkillsArr,userSkillsSet){ const matched=[]; for(const jd of jobSkillsArr){ for(const us of userSkillsSet){ if(fuzzyMatch(jd,us)){ matched.push(jd); break; } } } return Array.from(new Set(matched)); }
async function processJDViaBackendWithFallback(text, request, sender) {
  // 1) Try backend first (with timeout)
  const backendPayload = {
    text
  };

  try {
    // Use your apiClient.methods
    const resp = await timeout(
      apiClient.post("/jd/skills-match", backendPayload),
      3000
    );

    // Normalize various axios/fetch-like shapes:
    const data = resp?.data ?? resp;
    // Expecting backend to return the same parameters you need:
    // { percentage, matchedWords, allSkills }
    const normalized = normalizeBackendJDResponse(data);

    if (normalized) return normalized;

    // If backend responded but payload isn't usable → fallback
    console.warn("[jdText] backend response invalid, using fallback", data);
  } catch (e) {
    console.warn("[jdText] backend failed, using fallback:", e);
  }

  // 2) Fallback to local extraction (your current logic)
  const jdSkills = await extractSkillsHybrid(text);
  const userSkillSet = await getUserSkillsSet();
  const matchedWords = matchJDToUser(jdSkills, userSkillSet);
  const percentage = percent(matchedWords.length, jdSkills.length);

  return {
    percentage,
    matchedWords,
    allSkills: jdSkills
  };
}

function normalizeBackendJDResponse(data) {
  if (!data || typeof data !== "object") return null;

  const percentage = Number(data.percentage);
  const matchedWords = Array.isArray(data.matchedWords) ? data.matchedWords : null;

  // allow backend to send allSkills or jdSkills (either is fine)
  const allSkills = Array.isArray(data.allSkills)
    ? data.allSkills
    : Array.isArray(data.jdSkills)
      ? data.jdSkills
      : null;

  if (!Number.isFinite(percentage)) return null;
  if (!matchedWords || !allSkills) return null;

  return { percentage, matchedWords, allSkills };
}

export {normalizeBackendJDResponse,processJDViaBackendWithFallback,percent,matchJDToUser};