# Handoff — Phase 10: Commercial redesign (design handoff → shipped UI)

**Date:** 2026-08-22 · engine **0.6.1** · sandbox golden `d25ed4f0e573169c` · save format **v3** · `pnpm check` 167 tests green

Jan's design handoff (`docs/design/handoff/` — `README.md`, `BULLY OFF - Commercial.dc.html`, `Pitch.dc.html`, `Current UI.dc.html`, `support.js`) was implemented end to end in the README's build order. The HTML files are references, not code: every screen is a Vue component, every string an i18n key in NL/EN/FR, every number from the engine/season/insight packages.

## Build order, as shipped

1. **Tokens + fonts** — `tokens.css` gained the commercial layer (`--ink … --turf-alt`), Barlow / Barlow Condensed / IBM Plex Mono self-hosted as latin-subset woff2 (119 kB, precached), dark-only (`color-scheme: dark`). ADR-012 amendment 1.
2. **Pitch renderer** — `packages/render/src/pitch.ts`: FIH geometry, mow stripes, tactical overlays, a camera table (full / half / circle / goalmouth / broadcast / lowAngle / behindGoal / cornerCam) expressed as one homography projector; `MatchView` redraws through the projector every frame, exposes `setCamera / setOverlay / snapshot(tick)`. Chrome (clock, names, score) left the canvas — Vue owns it.
3. **App shell** — `stores/app.ts` (screen, intro flags, camera/overlay, savedAt), `App.vue` switches screens with an out-in fade; `HubShell` = app bar + club bar shared by season / squad / tactics / club / rulebook.
4. **Season hub** — table with play-off / barrage / relegation rails, calendar, results, history, form, staff advice (`insight.adviseSeason`), treatment room, next-opponent scouting line.
5. **Insight + report** — `packages/insight` (`analyse`, `momentum`, `matchSheet`, `ruleFor`, `adviseSeason`, `playerRead`) returns i18n keys + params, never prose. `ReportView`: header, match sheet, momentum bars, key moments with thumbnails **rendered from the replay at the moment's tick** (`MatchView.snapshot`), what-went-well / work-ons, rule of the match with a deep link into the rulebook, replay export.
6. **Club select, world generation, title, onboarding, intro** — `NewCareerView` (profile / region / history / turf / seed, KPI tiles, historical ledger), `ClubSelectView` (24 crests, detail card, kit swatches, "take the job"), `TitleView` (key art + 5-row menu), `Onboarding` (3 cards, once), `IntroView` (film/poster, skip on click/key/scroll, continue card from the autosave).
7. **Touchline HUD** — direction 1b "instrument panel": top bar with kit chips and the "you" badge, SYSTEM dials, pitch with camera + overlay chips, LIVE counters, LEGS (stamina), match log, timed decisions (PC: FLICK / SLIP; coach reads: GO WIDE / HOLD SHAPE), tactics drawer, quarter briefings.

## Fixes found in the end-to-end play-through (Chrome, real world → two coached matches → report)

- Vite served an **empty transform** of `packages/render/src/index.ts` after the rewrite (stale cache) — touch the file / restart the dev server if `createMatchView` "is not exported" ever shows up again.
- Historical ledger printed club **ids** in the final line (`c2 4-1 c11`) — the season package records ids; the view maps them to names.
- Matchdays are 0-based in the season model; every label now shows `day + 1` (hub, continue cards, report header, calendar, winter-break legend).
- **Kit clash**: Préfontaine (red) v Fontainemal (red) drew both teams red. `kitPair()` in the season store: the home side wears its first kit, the visitors change to their second colour when the RGB distance is under 110 (cream fallback when both clash).
- After a coached match the hub hid COACH THE MATCH until SIM MATCHDAY was pressed (the other eleven fixtures of the round were unplayed). `finishCoaching` now plays out the rest of the round before saving.
- Saves mark the app bar (`markSaved`) from the store, not from each caller.
- **Goals deflected in off a defender/keeper had no scorer** (`scorerId: null` whenever the defending side got the last touch). `packages/rules` now tracks the last stick touch per team and credits the attacker — hockey credits the last attacker to play the ball. Engine 0.6.1, all scenario hashes re-baselined (the version bump changes every hash; only `pc-lowHit` changed on content).
- Untranslated leaks: card colours (`sim.card.*`), surface names in the report/club page (`career.watered|dry|wet`), club budget labels (`club.*`), "none since {year}" → "the last in {year}".
- ESLint now ignores `docs/**` (the design handoff ships `support.js`).

## Imagery (ADR-012)

Generated with Jan's ChatGPT account from prompts written for the art direction in the handoff (painterly, floodlit, watered turf, dark teal + emerald, no text/logos/faces), fitted to the exact component sizes with `tools/art/fit.py` (Pillow) or in-browser canvas, saved as **webp**:

| Asset | Size | Path |
| --- | --- | --- |
| Title key art | 1280 × 1260 | `apps/manager/public/title/keyart.webp` |
| Intro poster | 1440 × 560 | `apps/manager/public/intro/poster.webp` |
| Onboarding world / season / bench | 906 × 252 | `apps/manager/public/onboarding/{world,season,bench}.webp` |
| Portraits | 192 × 224 | `apps/manager/public/portraits/{m,w}-{1..6}.webp` |

Key-moment thumbnails are not assets: they are rendered from the replay. The intro film (`intro/film.mp4`) is optional — the poster plays with a slow push-in until a film exists.

## What surprised me

- A hidden browser tab never fires `requestAnimationFrame`, so Vue's CSS transitions (and the Pixi ticker) stall until the tab is visible again. That is normal browser behaviour and self-heals; do **not** "fix" it with `:css="false"` on an out-in `<Transition>` — the synchronous leave re-enters the parent patch and crashes (`parentNode of null`).
- The worker keeps running in a hidden tab, so "sim to full time" and match-day sims are the reliable way to drive the game from automation.

## Next

- Phone pass with the new screens (`docs/release.md`); the coach view below 1100 px stacks but was only checked on desktop.
- Replay the design page's "quick match" from the title (today it opens the viewer with the scenario list).
- Optional intro film (45–60 s loop) to replace the poster push-in.
