# ADR-014 — Adaptive play and learning, without giving up determinism

**Status:** Accepted · 2026-08-22
**Decides:** where learning may live in BULLY OFF, and what must stay a pure function. Extends BRIEF §5.4 (utility AI), §5.5 ("opponents build a read on your tendencies across a season") and §6 (calibration). Touches ADR-002, ADR-005, ADR-007, ADR-010, ADR-011.

## Context

The About page calls the game "a deterministic match engine". Read by a player — or by a coach — that sounds like *scripted*: a fixed set of rules that always fires the same way, a team that never learns, a career where nothing grows except an age curve. The word is doing damage it does not deserve.

**Determinism and rule-based are different properties.**

- *Deterministic* = the same seed, setup and instruction list produce the same match, tick for tick, on any machine that runs the same engine version. That is a **reproducibility** property. Four decisions already rest on it: ADR-002 (the event log is the only contract), ADR-005 (float64 with lint guardrails), ADR-007 (replays are append-only and re-simulatable), ADR-011 (server-authoritative multiplayer, if ever). Give it up and replays, save games, the golden hash and the whole calibration harness go with it.
- *Rule-based* = behaviour is a fixed hand-authored policy. That **is** what the engine does today, and it is the honest complaint. `packages/engine/src/ai/brain.ts` scores actions against roughly forty hand-tuned constants (`1.2 * gain`, `0.35 * open`, `riskW = 1.4`, `intoD = 0.45`, …). Jan turned every one of those dials by hand until Phase 4 calibration passed. Nothing in the engine has ever *learned* anything.

A learned policy is not less deterministic than a hand-written one: a fixed weight vector is a pure function of its input. What breaks determinism is a *non-deterministic source* — `Math.random`, wall-clock time, async ordering, a network call. Those are already banned (CLAUDE.md rule 4) and none of them is needed for any of this.

So the question is not "deterministic or adaptive". It is: **where does learning happen, and what crosses the engine boundary?**

Three places are available, and they answer three different complaints:

| Complaint | Layer | Where learning happens |
|---|---|---|
| "The AI plays the same hockey it played on day one" | **A — offline fitting** | in `tools/`, over thousands of simulated matches; ships as data |
| "They never read me — I can run the same drag flick nine times" | **B — in-match opponent model** | inside a single seeded match, in controller state |
| "My club never grows into anything" | **C — season learning** | at the season roll-over, in `packages/season` and the save file |

## Options considered

### A. Keep it rule-based; tune by hand forever
- **For:** zero new machinery. Every constant keeps a hockey-readable comment (CLAUDE.md rule 7).
- **Against:** hand-tuning a 40-dimensional space against 14 calibration targets is not a thing a human does well; Phase 4 and 9.1 both showed it (PCs and circle entries still out of band). Nothing adapts within a match or across a career. This is the status quo and it is what prompted the question.

### B. A learned policy network inside the engine
Train a neural policy (self-play, behaviour cloning, RL) and evaluate it per player per tick.
- **For:** genuinely emergent play; the honest "not rule based" answer.
- **Against:** breaks `packages/engine` has zero runtime dependencies (CLAUDE.md rule 3) unless the inference is hand-rolled; a net evaluated for 22 players at 10 Hz across the 10 000-match calibration batches is orders of magnitude too slow for the harness that keeps this project honest; and it destroys rule 7 — you cannot write "the hockey reason" next to weight 4 711. Training data does not exist: there is no corpus of real hockey tracking data we are allowed to use (ADR-006), so the only teacher is our own engine, and a net trained on our engine can only learn our engine's mistakes with more confidence.
- **Rejected**, not on ideology but on the four constraints this repo already accepted.

### C. Three layers of learning, all of them data or seeded state
- **A** — the utility weights and the pitch-value function stop being hand-typed constants and become **fitted data**: a `PolicyWeights` profile next to `Profile`, produced by an optimiser in `tools/calibrate` whose objective is the existing calibration report plus a self-play tournament. The engine reads it exactly the way it reads `MENS`/`WOMENS` today.
- **B** — the AI keeps a small, typed **`ScoutMemory`** per match, updated from what it can legally see (`RulesView`, ADR-002): which side you build up on, which PC variant you keep running, whether your left back can be pressed, whether your keeper commits. Decayed, confidence-gated by the reader's `decisions` / `pcReading`. It is online Bayesian-flavoured updating: fully deterministic, because it is derived from the seeded run itself.
- **C** — the season model learns three things it does not learn today: players grow **at what they actually did** (from the event log, not only from an age curve), squads grow **familiarity** with a system they have drilled for two seasons, and AI clubs adjust their tactics from results (a seeded bandit over the presets). Scouting reports carry `ScoutMemory` priors from one meeting to the next — which is exactly the BRIEF §5.5 requirement that reusing one PC variant all season must be punished.

### D. "Adaptive" by injecting fresh randomness (form, momentum, hot streaks from an unseeded source)
- **Rejected outright.** It reads as adaptive for one match and destroys replays, goldens and calibration. Every stochastic effect must come from the injected `Rng`.

## Decision

**Adopt option C.** Learning is allowed — encouraged — under four invariants:

1. **The engine stays a pure function** of `(seed, setup, weights, instructions)`. Anything learned during a match is derived from that seeded run and lives in controller state, never in module scope, never carried between matches except through an explicit, serialised input.
2. **Learned knowledge crosses the engine boundary as data, never as code.** `PolicyWeights` and any fitted value function are versioned data alongside `Profile`, hashed into the golden and pinned to `ENGINE_VERSION` — the same treatment the profiles get. Men's and women's stay separate weight sets; this must not reintroduce `if (isWomens)` (CLAUDE.md rule 5).
3. **Fitting lives in `tools/`, which may take dev dependencies; `packages/engine` takes none.** The optimiser, the tournament runner and any statistics live outside the engine and communicate with it only through the existing headless batch API.
4. **Every learned number keeps a hockey-readable meaning.** A weight is named for the hockey quantity it scales (`passIntoCircle`, `carryIntoDefenderStick`, `feetTargetVsCleanShot`) and keeps its rule-7 comment. This is what rules out an opaque net and permits fitted utility weights, fitted value surfaces with named axes, and counter-based opponent models.

Additionally: **calibration is promoted from a report to an objective.** `pnpm calibrate:run` already measures the distance between the engine and Belgian League reality; option A makes that distance the loss function. The "accumulated hockey knowledge" the game learns from is precisely `docs/rules/calibration-data.md` plus the situational verdicts in `docs/rules/situational-review.md` — not a mystery corpus.

**Prerequisite, added after review:** layers B and A are worth nothing over an action space that cannot express the hockey. The AI currently presses with "the two players nearest the ball", has no marking outside its own 23, no free man, no rest-break, and exactly one penalty-corner running-out system; its four press systems differ only by a height scalar. **`docs/design/hockey-systems.md`** specifies the tactical model — press systems, assignments, PC defence systems and circle-entry patterns, all as data — and it is built *before* any learning layer. What layer B then learns to do is *choose between* those systems and variants.

Build order and the concrete data structures are in **`docs/design/hockey-systems.md`** and **`docs/design/adaptive-play.md`**. Nothing there starts before v1.0 is tagged (CLAUDE.md rule 2).

## Consequences

**What we gain**
- The AI stops being a set of Jan's guesses and becomes a fit to the best hockey data we have, re-fittable the day open question 17 (transcribed match reports) lands.
- Matches acquire a second half that differs from the first because the opponent has read you — the single most "alive" thing a match engine can do.
- Careers acquire growth that is *earned* (minutes, corners taken, entries defended) rather than granted by an age curve.
- BRIEF §5.5's unimplemented promise ("opponents build a read on your tendencies across a season") gets a mechanism, and open questions 16, 25 and 26 get an answer.

**What we pay**
- **The golden hash changes** at every layer that lands, and `ENGINE_VERSION` bumps with it. That is the existing policy, not a new cost, but it means each layer is its own phase with its own re-calibration.
- **Save format v4**: scouting reports, familiarity, per-season usage, and the id of the weight set a career was played under (ADR-007 linear migration).
- **Re-calibration after every fit.** A fitted policy that wins more is not automatically hockey; the calibration bands are the guardrail and the situational panel is the judge.
- **A real risk of degenerate self-play.** An optimiser told only to win will find hockey that no coach recognises (eleven players camped on the D line, every restart hit long). Mitigation is structural: the measured calibration bands are **hard constraints** on any candidate, win-rate is only the tiebreak among candidates that already pass, and no fitted weight set ships without a situational review.
- **A risk of overfitting to estimated targets.** Nine of the fourteen targets are `EST`. Fitting hard against a guess dresses a guess up as a measurement. Mitigation: `EST` rows enter the loss at a lower weight, and the report keeps labelling them.

**Reversal condition**
If a fitted policy cannot pass calibration and the situational panel at the same time — that is, if "wins more" and "is hockey" turn out to be in real tension in this engine — layer A is abandoned and the hand-tuned constants stay, with layers B and C standing on their own. B and C do not depend on A.

If a runtime neural policy is ever seriously proposed, this ADR must be superseded, and CLAUDE.md rules 3 and 7 with it.
