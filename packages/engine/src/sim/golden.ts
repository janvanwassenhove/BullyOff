/**
 * Golden hash of the canonical sandbox fixture (seed 42, mens/watered, 600 ticks, sandbox mode).
 * History: 0.1.0 → 60abc0490dcdf885 · 0.2.0 → 4bd0c4840e5778f0 (body contact updates lastTouch)
 *          · 0.3.0 → 34f09eb279444e5c (air drag on the rolling ball, realistic rolling resistance, strike brings the ball in front)
 *          · 0.4.0 → 8b762ab25cd72f6d (Phase 4: effective body radius 0.5 m, calibrated surfaces/keeper/attributes).
 *          · 0.7.0 → cec18ab670a0562b (Phase 11: pressing systems are data and the defence works from assignments — channel owner presses, cover, sticky man-marking, the free man and the rest-break — instead of "the two players nearest the ball"; the sandbox fixture is scripted, so this is a version-only change to its log).
 *          · 0.6.1 → d25ed4f0e573169c (goals that deflect in off a defender/keeper are credited to the last attacker to play the ball — scorerId in Goal events; version bump changes every hash).
 *          · 0.6.0 → e872b9301b4cfd6e (Phase 9.1 realism pass: named formations/press systems/mentality, no passes into own D, dribble kept on the stick, defenders collapse into the D, win-the-corner shots, GK scales 1.6/1.85 — version-only change to the sandbox log).
 *          · 0.5.0 → 51e34b89dcb71850 (Phase 7: stamina in the controller view, bench recovery, stamina-driven rotation, coach instructions; rules: a PC ends when the ball crosses the goal line without a goal — version-only change to the sandbox log).
 * Asserted in Node (determinism.test.ts) AND in Chromium/Firefox/WebKit
 * (browser/determinism.browser.test.ts). If an intentional engine change alters
 * the log, bump ENGINE_VERSION and update this value — never silently.
 */
export const SANDBOX_GOLDEN = { seed: 42, ticks: 600, profile: 'mens', surface: 'watered' } as const;
export const SANDBOX_GOLDEN_HASH = 'cec18ab670a0562b';
