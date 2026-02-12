/**
 * scripts/atswatchers/detection/signals.js
 * Regex patterns, CSS selectors, and scoring thresholds
 * used to detect success / auth / email-verify pages.
 */

export const SUCCESS_SCORE_THRESHOLD = 0.6;

// ── URL & body-text success patterns ────────────────────────────

export const URL_SUCCESS_RX =
  /(thank[\s-]?you|application[-\s]?submit(?:ted)?|submission[-\s]?complete|post-?apply|confirmation|success|applied)/i;

export const TEXT_SUCCESS_RX =
  /\b(thank\s+you(?:\s+for\s+applying)?|application\s+(?:submit(?:ted)?|received|complete)|you.?ve\s+applied|submitted\s+successfully)\b/i;

export const EMAIL_VERIFY_RX =
  /\b(verify|verification)\s+(your\s+)?email\b/i;

// ── Auth / login guards ─────────────────────────────────────────

/** URL / title pattern for auth pages */
export const AUTH_RX =
  /(sign[-\s]?in|log[-\s]?in|authenticate|forgot|create[-\s]?account)\b/i;
// note: "register" excluded (too noisy)

/** DOM selectors that indicate an auth page */
export const AUTH_SELECTORS = [
  '#login-form, #sign-in-form, .login-page, .auth-page',
  'input[type="password"]'
];

// ── Success element selectors ───────────────────────────────────

export const SUCCESS_SELECTORS = [
  // site-specific-ish
  '#application\\.confirmation, #application_confirmation, #application-confirmation',
  '.artdeco-toast-item__message',
  // generic-ish (must be visible and contain relevant words)
  '[data-testid*="thank" i]:not([hidden])',
  '[data-testid*="confirm" i]:not([hidden])'
];