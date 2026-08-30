# Handoff — Phase 10.5: the realism validation (rules, academy, gameplay calibration)

Jan asked for a validation of the whole application for *correct gameplay* — realistic hockey, and correct information in the academy and the rulebook — with fixes where needed, for PWA and webapp alike.

## 1 · The rulebook against the FIH rules

Every rule text was read against the current FIH Rules of Hockey (13.5, 13.7, 2.3/2.4, 9.11, 9.8–9.9 checked explicitly, 13.7 verified against the published rules because memory was not to be trusted). Five texts were wrong or outdated, fixed in NL/EN/FR (surgical string replacement — the i18n files keep their formatting):

- **Strafcorner**: said "five defenders **plus** the keeper" behind the line — FIH 13.5 is at most five *including* the keeper. (The figure scene already drew it right: keeper + four.)
- **Te vroeg uitlopen**: said an early-breaking attacker "concedes a free hit" — since 2019 the offender (defender *or* attacker) is sent beyond the centre-line and the corner is retaken; a sent-off defender cannot be replaced.
- **Wissels**: "only the keeper may be replaced" during a PC → only an *injured or suspended* keeper.
- **Voetregel**: added the advantage nuance (in the circle the advantage is near-automatic, outside it the umpire only whistles when advantage follows) — this now also matches what the engine actually calls, since the stick-save work below.
- **Gevaarlijk spel**: clarified that the PC/stroke escalation applies when a *defender* does it in his own circle.

The academy content survived review unchanged — its hockey (injection speeds, variants vs runner lines, press channels, baseline pull-backs, drawing the foot) is sound and consistent with how the engine now actually plays.

## 2 · Gameplay: the calibration debt paid, and then some

`pnpm calibrate:run` (the recorded debt) measured the truth: men 6/15 bands, women 9/15 — 12.9 circle entries where real hockey has ~36, 4.5 corners where it has ~9, 16 % of goals from corners where a third is normal. The method that worked: **diagnose the possession funnel before touching knobs** (a temporary `diag.script.ts`, deleted after — the method is what matters: possessions by zone of death, 23-entries → circle entries, entry passes attempted vs arrived, attackers inside the D at edge possession, fouls by kind and award, PC outcomes). Findings and mechanisms are written up in `docs/rules/calibration.md` §"The realism calibration (engine 0.8.0)"; headlines:

- interception was as easy as receiving (146 clean cuts a match) → a cut is now a lunge, a failed cut clips the ball onward;
- receives spilled 29 % of the time → trap success re-based;
- forwards never arrived in the D (0.5 attackers there on average) → rest-break holds higher, forwards sprint to their pockets, the entry ball outweighs the recycle;
- every ball through traffic was a foot foul (49 of 62 fouls) → skill-dependent stick saves, except point-blank / own-D / on the line (the stroke situation);
- the PC flick went into the first runner (5 % conversion) → the taker picks the clearest lane; strokes get set-piece accuracy;
- defenders scrambled in their own D → clearance first, into touch under pressure;
- nobody reacted to the score → chasing/protecting mentality+press in Q3/Q4 (also what fixed the scoreline shape);
- absolute speed thresholds judged the women's game at men's tempo → thresholds scale with `profile.strike.pushSpeed` (a value, no branch);
- cards: persistent thresholds 3/5 → 5/7; stroke distance 5 → 9 m per FIH 12.4; keepers rescaled (mens 2.05, womens 1.88).

**Final: men 14/15, women 12/15, every directly-measured metric passes in both.**Remaining: women's entries/shots/restarts each a whisker from an *estimated* band edge, and the men's Poisson-shape test flips with the seed set (partly a target problem: a ±2-level league is genuinely top-heavy).

## 3 · What a maintainer must know

- `ENGINE_VERSION` 0.7.0 → **0.8.0**; sandbox golden `7511507816fd5c49`, all 13 scenario hashes re-baselined (the `BallStruck` event now carries `angle` — that alone changes every hash; `isShot` falls back for old logs without it).
- A *shot* is now a strike from in the D aimed within 4.8 m of the goal mouth — the stats bands and the match report mean the same thing as a real match report.
- `tempo.test.ts` gained an entries floor (≥ 16 avg over 4 seeds) so a regression to pre-calibration penetration fails in CI, not in a season review.
- The stick-save, interception and D-clearance logic all draw extra Rng — any reordering there re-baselines goldens again.
- `rules.test.ts` persistent-fouling cases now foul five times for green, seven for yellow. `profile.test.ts` no longer asserts a gk-scale ordering between profiles (both are calibrated against their own game's tempo; asserted range 1.5–2.5).
- The render browser loop-test polls for the second view instead of one 400 ms sleep (headless FF/WebKit + busier 0.8.0 logs).
- Deliberately NOT done: modelling side-ins volume (both games keep the ball in play more than reality — the honest fix is wide-channel play, not noise), and chasing the Poisson band by softening team-quality spread (review the target first).

## 4 · Files changed

Engine: `match/match.ts` (interception, stick save, set-piece spray, angle on BallStruck, lastStrikeTeam), `player/attributes.ts` (tackle base, trap success + speedRef, stroke save), `ai/brain.ts` (entry weights, feet ball 0.9 power, blocker-aware PC aim, D-clearance, rest-break height, forward sprints, chasing the game, stroke aim), `ai/tactics.ts` (FWD pocket inside the D), `profile.ts` (gk scales, women's pace), `sim/stats.ts` (honest shot), `sim/golden.ts` + `scenarios.golden.json` + `constants.ts` (0.8.0), `sim/tempo.test.ts`, `profile.test.ts`, `events/events.ts`. Rules: `laws.ts` (card thresholds), `rules.ts` (stroke distance), `rules.test.ts`. Render: `browser/matchview.browser.test.ts`. Manager: `i18n/{nl,en,fr}.json` (five rule bodies). Docs: `docs/rules/calibration.md`, this file, `KICKOFF.md`.
