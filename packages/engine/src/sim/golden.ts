/**
 * Golden hash of the canonical sandbox fixture (seed 42, mens/watered, 600 ticks, sandbox mode).
 * History: 0.1.0 → 60abc0490dcdf885 · 0.2.0 → 4bd0c4840e5778f0 (body contact updates lastTouch)
 *          · 0.8.2 → 14b39f56c9724b59 (keeper reflex slope halved with the calibrated mean kept:
 *            gkSaveScale multiplies the whole save chance, so the old 0.75 slope made one keeper
 *            worth ±5 goals a match and the weakest club lost 0-10 — version-only change to the
 *            sandbox log; every AI scenario changes.)
 *          · 0.8.1 → 645cdbc6a3a1d81f (the review pass: after a goal both teams retake their kickoff
 *            shape in their own half before the centre pass (setup 12 s / 6 s fast), and the halfway
 *            five at a defending PC join in after the injection — recoverers to the top of the D,
 *            two counter outlets wide at halfway.)
 *          · 0.8.0 → 7511507816fd5c49 (the realism calibration: interception is a lunge not a receive, stick saves
 *            before body contacts, urgent D clearances, blocker-aware PC flicks, chasing the game,
 *            tempo-scaled thresholds via the profile, BallStruck carries its angle — the sandbox log
 *            changes through the new event field and the version; every AI scenario changes.)
 *          · 0.3.0 → 34f09eb279444e5c (air drag on the rolling ball, realistic rolling resistance, strike brings the ball in front)
 *          · 0.4.0 → 8b762ab25cd72f6d (Phase 4: effective body radius 0.5 m, calibrated surfaces/keeper/attributes).
 *          · 0.7.0 → cec18ab670a0562b (Phase 11 pressing systems as data + Phase 10.1 tempo pass: passes arrive at 6.5–10 m/s instead of 5.5–8.5 — the sandbox log is version-only; every AI scenario changes).
 *          · 0.6.1 → d25ed4f0e573169c (goals that deflect in off a defender/keeper are credited to the last attacker to play the ball — scorerId in Goal events; version bump changes every hash).
 *          · 0.6.0 → e872b9301b4cfd6e (Phase 9.1 realism pass: named formations/press systems/mentality, no passes into own D, dribble kept on the stick, defenders collapse into the D, win-the-corner shots, GK scales 1.6/1.85 — version-only change to the sandbox log).
 *          · 0.5.0 → 51e34b89dcb71850 (Phase 7: stamina in the controller view, bench recovery, stamina-driven rotation, coach instructions; rules: a PC ends when the ball crosses the goal line without a goal — version-only change to the sandbox log).
 * Asserted in Node (determinism.test.ts) AND in Chromium/Firefox/WebKit
 * (browser/determinism.browser.test.ts). If an intentional engine change alters
 * the log, bump ENGINE_VERSION and update this value — never silently.
 */
export const SANDBOX_GOLDEN = { seed: 42, ticks: 600, profile: 'mens', surface: 'watered' } as const;
export const SANDBOX_GOLDEN_HASH = '14b39f56c9724b59';
