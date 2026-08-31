# Handoff — Phase 11b: handedness

`docs/design/hockey-systems.md` §6, confirmed with Jan on 2026-08-22 as its own phase at full scope. Every hockey stick is right-handed: a player's **open stick side is their right**, their **reverse is their left**. Before this the engine knew no difference between left and right anywhere — a pressing angle was a distance, a tackle had no side, and a ball arriving on your backhand was the same ball.

## What landed

One primitive, `packages/engine/src/player/handedness.ts`: `lateral` — the sine of the bearing to something relative to where a player faces, −1 hard on the open stick … +1 hard on the reverse. A sine and not a side flag on purpose: a ball half a metre off the front foot is barely a reverse ball, and a step of the body turns it into a forehand one. Hockey is played in that gradient.

Everything else is that primitive scaling an attribute-derived number — an *input* to physics, never physics (Phase 3's rule):

- **Receiving** (§6.3) — a ball on the reverse costs a touch. Measured in play at matched ball speed: **78 % clean on the forehand against 66 % on the reverse**.
- **Striking** (§6.5) — the reverse is weaker and sprays wider, worst for a hit, barely at all for a push.
- **Carrying** (§6.4) — eliminating on the reverse is harder, so being shepherded onto it costs the carrier in the value function and not only in the picture.
- **The tackle side** (§6.2) — from the carrier's open stick side the ball is right there and the tackle is the clean one; across the body you reach through the man, which is a stick tackle when you catch him and obstruction when he holds the shield. Measured in open play: **open stick 21 % won and 15 % fouls; across the body 12 % won and 24 % fouls**.
- **The pressing angle** (§6.1) — `jockeySpot` in `ai/tactics.ts` is now a named, tested function beside `pressLineM`/`backLineM`: `toReverse` puts the first defender goal-side *and* on the carrier's forehand shoulder, so the only way forward is onto his reverse. The AI also tackles more willingly from the clean side, and its passes, shots and carries know which stick face they will need.

## What it does not touch

Physics (no stick model, no new forces). Left-handed players — they do not exist in hockey and there is no attribute for one. The keeper's stick-side/pad-side asymmetry, deliberately, while `gkSaveScale` is still provisional.

## Three modelling errors this phase found (and fixed)

1. **The reverse is about which face has to play the ball, not where you aim.** Keying the strike penalty to the aim direction made a drag flick at a corner count as a reverse; PC conversion fell to 0.13. It is now keyed to where the ball sits relative to the striker.
2. **A set piece has no reverse at all.** At a stroke, a free hit or a corner the ball is stationary and the clock is stopped: the taker walks round it and plays it off his forehand. Before the exemption, stroke conversion sat at 0.51.
3. **Class must not compound.** The first version scaled the penalty steeply with skill; 6+ goal team scores nearly doubled and the Poisson shape test failed — the blowouts Jan complained about, coming back through a new door. The truer statement is that the reverse is awkward for everybody and what a good player owns is the footwork to *avoid* being put on it. With a shallow skill term the tail came back to normal.

Also caught by a test before it ever reached a match: `dmath.angleDelta(a, b)` is `b − a`, so the first version had every side mirrored.

## Calibration

`gkSaveScale` (men) 2.05 → **1.84**. That is not knob-turning: the knob is documented as carrying "the part of the gap that shot speed alone does not explain", and handedness now explains some of that gap for real, so the provisional knob shrinks — which is the point of it. Numbers, seed sensitivity and the full reasoning are in `docs/rules/calibration.md` §"Handedness (engine 0.9.0)". Headline: goals 5.56 (men) / 3.78 (women), PCs 9.5, PC share 0.33, and **all measured rows pass on an independent seed set** for both profiles.

**Read the draw-rate row with care.** On the standard seed set the men's and women's draw rates miss their bands in *opposite* directions from the same code; the standard error at n = 96 is ±0.04. `--seed 900` returns measured-all-pass for both. Do not tune against that row alone.

## Engine 0.9.0

Sandbox golden `2c22986d5b9e092a`, all thirteen scenario hashes re-baselined. `pnpm check` **251 tests** (19 new), `pnpm test:browsers` green.

New tests worth knowing about:
- `player/handedness.test.ts` — the pure factors, all *relational* (ordering, never magnitudes).
- `ai/press.test.ts` §"the pressing angle" — the jockey spot as geometry: `toReverse` stands on the forehand shoulder whichever way the carrier turns, every system still jockeys goal-side within a stick's working distance.
- `sim/handedness.test.ts` — the two claims measured over played minutes, each with its confound controlled: receiving is compared **at matched ball speed** (a man standing over a rolling ball controls it either way) and tackles **in open play only** (inside a 23 the defence lunges from whatever side it can reach and the fouls of the circle swamp the comparison).

Two things deliberately *not* asserted in-match, and why: the tackle **foul-rate** gap (real, pinned exactly in the unit test, but a played match yields a handful of open-play fouls per side — 6 against 8 is a coin toss), and the emergent shepherding ratio (measured at 0.85 vs 1.89 in one build and 1.02 vs 0.84 in another — a statement about sample size, not about hockey; the geometry test covers the claim exactly).

## Next

Per `hockey-systems.md` §9 the order is **12 — Naturalness** (`adaptive-play.md` layer D: commitment, softmax, anticipation, timed runs), then reads → fitting → season learning. §5 (PC defence systems) and §7 (entry patterns) from Phase 11 are still open and are the other half of the action space.

## Files

Engine: `player/handedness.ts` + `player/handedness.test.ts` (new), `match/match.ts` (strike/trap/tackle sides, set-piece exemption), `ai/brain.ts` (jockey call, pass/carry/shoot side terms, tackle-side keenness), `ai/tactics.ts` (`jockeySpot`), `ai/press.test.ts`, `ai/coach.test.ts` (rotation averaged over two seeds), `sim/handedness.test.ts` (new), `sim/tempo.test.ts` (launch-speed floor restated for the reverse), `profile.ts` (gkSaveScale), `constants.ts` (0.9.0), `sim/golden.ts`, `sim/scenarios.golden.json`. Docs: this file, `docs/rules/calibration.md`, `docs/design/hockey-systems.md`, `KICKOFF.md`.
