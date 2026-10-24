// Contract constants (docs/CONTRACT.md S5.1).
export const FEATURES = [
  "noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty",
  "cuisine_asian", "cuisine_latin", "cuisine_mediterranean", "cuisine_american", "cuisine_cafe_dessert",
] as const;
export const K = FEATURES.length;

// Stopping rule for elicitation (build-brief B1).
export const CONFIDENCE_TARGET = 0.9;
export const MIN_SWIPES = 4;
export const MAX_SWIPES = 12;
export const PREVIEW_DEBOUNCE_MS = 1500;
export const COUNCIL_CAP_MS = 12_000;
export const SCOUT_TIMEOUT_MS = 20_000;
export const API_TIMEOUT_MS = 20_000;
