

// Single source of truth (shared across all modules)
export const JA_STATE = {
  // JD + skill match
  jdAnchorEl: null,
  lastJDHash: "",
  matchedWords: [],
  percentage: 0,
  allSkills: [],
  _didFullJDForUrl: new Set(),
  // Scan / canonical job
  currentJobKey: "",
  jobApplicationDetected: false,
  // LinkedIn + generic meta caches
  lastActiveLIMeta: null,
  lastActiveGenericMeta: null,
};

export function resetContentState() {
  JA_STATE.jdAnchorEl = null;
  JA_STATE.lastJDHash = "";
  JA_STATE.matchedWords.length = 0;
  JA_STATE.percentage = 0;
  JA_STATE.allSkills.length = 0;
  JA_STATE._didFullJDForUrl.clear();
  JA_STATE.currentJobKey = "";
}

export function resetDetection(){
    JA_STATE.jobApplicationDetected = false;
}

export function resetLinkedInState() {
  JA_STATE.lastActiveLIMeta = null;
}

export function resetGenericMetaState() {
  JA_STATE.lastActiveGenericMeta = null;
}

export function resetAllState() {
  resetContentState();
  resetLinkedInState();
  resetGenericMetaState();
}
