// APEX BRAIN V5.0 — REMOVED
// This module (algoAdvanced.js, 229 lines) was never imported anywhere in the codebase.
// It contained Kelly Criterion, HMM, Hurst Exponent, Kalman Filter stubs built during
// V4.2 development that were never wired into scanner, chat, or agentic loop.
//
// If any of these tools are needed in the future:
//   - Kelly Criterion → already implemented properly in adaptiveLearning.js scoring
//   - HMM regime detection → use regimeDetection.js (the real implementation)
//   - Kalman / Hurst → not currently justified; re-introduce only if signal evidence supports it
//
// Exporting empty named exports so any phantom import fails loudly rather than silently.
export const kellyCriterion = undefined;
export const detectRegime = undefined;
