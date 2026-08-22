# Adaptive play — the build plan

> Companion to **ADR-014**. Read that first: it fixes *where* learning may live. This file is *what to build, in what order, and how each piece is tested*. Nothing here starts before v1.0 is tagged (CLAUDE.md rule 2). Each layer below is sized as its own phase with its own gate and handoff.

## The complaint, restated precisely

`packages/engine/src/ai/brain.ts` is a good utility AI and a completely static one. Three things are missing, and they are not the same thing:

1. **It looks robotic** — flip-flopping decisions, everyone chasing the ball's *current* position, off-ball runs that are a shape function rather than an intention. This is not a learning problem at all. It is the cheapest fix and the biggest perceived gain.
2. **It never reads you** — you can run `dragFlick` nine times in a match and nine times in a season.
3. **It never gets better** — neither the AI's policy, nor a squad that has drilled a system for two years, nor a player who took forty corners this season.

Fix them in that order: **D → B → A → C** (the letters are ADR-014's layers; D is new and is not learning at all).

> **Read `hockey-systems.md` first.** It was written after this file, and it inserts a phase in front of everything here: the AI's defensive action space is `{run at the ball, mark inside our 23, stand in your slot}`, which cannot express a zonal block, a man-to-man full press, or a choice of penalty-corner running-out system. Learning over an action space that has no word for "hold your channel" cannot produce holding your channel. Systems first (§3, §5, §7 there), then D, then the reads, then the fit. The layer ordering table at the end of that document supersedes the one below.

---

## Layer D — naturalness (no learning, ~2 days, no new data)

These are the changes that make people stop calling it rule-based, and none of them touches determinism.

**D1 · Commitment.** The carrier re-scores every tick and takes the argmax. A 0.02-utility wobble between "carry left" and "carry right" therefore flips the player's body every tick. Give the option chosen at tick *t* a decaying bonus for ~0.5 s (`commitmentBonus`, decayed linearly), and make the bonus larger for low-`composure` players — a nervous player commits *harder*, not less.
*Hockey reason:* a player who has decided to take someone on has already dropped their shoulder. They do not re-decide at 100 Hz.

**D2 · Softmax instead of argmax.** Today: gaussian noise is added to each utility and the max is taken. That is not a stochastic policy — it is a policy with jitter, and it makes a slightly-worse option almost impossible. Replace with an explicit softmax over utilities at temperature `τ = f(decisions, composure, pressure, stamina)`, sampled from the injected `Rng`. A 6-`decisions` player under pressure at 40 % stamina genuinely picks the wrong pass sometimes; a 17 rarely does.
*Test (rule 8):* τ→0 reproduces argmax; the frequency of the best option falls monotonically with pressure and rises with `decisions`.

**D3 · Anticipation.** `shapeTarget`, `defend` and the support runs all key off the ball's current position. Key them off a short lead (`ball.pos + ball.vel · t_lead`, `t_lead ≈ 0.3–0.6 s` scaled by `positioning`). A defender who reads the pass is ahead of it; a 5-`positioning` defender is not.

**D4 · Timed runs.** A forward's run to the far post is currently triggered by the ball's *x*. Trigger it by the carrier's intent — the carrier already knows which pass it is about to play; publish that intent into `Ctx` for one tick so the runner leaves *before* the ball does.
*Hockey reason:* the run makes the pass, not the other way round. This is the single change that will most make circle entries look like hockey rather than like pinball.

**Gate:** goldens rebase once; calibration re-run stays in band; the situational deck (`pnpm simcli scenario …`) reads better to a coach's eye than 9.1 does.

---

## Layer B — the opponent model (`ScoutMemory`)

A small typed record per team, held by the AI controller for the duration of a match, updated only from what the controller may legally see (`RulesView`, ADR-002).

```ts
/** What this team has worked out about the opposition, this match. All values decay (half-life ≈ 5 match-minutes). */
interface ScoutMemory {
  /** −1 … +1: which flank they build up through (EWMA of outlet pass y). */
  buildUpSide: Scalar;
  /** Beta-style counts per PC variant seen: [attempts, goals]. Drives the postman's line and the keeper's set. */
  pcVariant: Record<PcVariant, [number, number]>;
  /** Their press has been beaten n times by the long ball → go long earlier. */
  pressBeaten: Scalar;
  /** Player ids ranked by how often they carry into our 23 — the danger man to mark. */
  carriers: Map<number, Scalar>;
  /** Does their keeper commit early on a 1v1? EWMA of keeper advance at the moment of the shot. */
  keeperCommits: Scalar;
  /** Effective observation count — nothing is acted on below `readThreshold`. */
  n: Scalar;
}
```

**Consumers** (each one is a hockey behaviour a coach would name):
- **Press side.** `buildUpSide` shifts the split press across before the ball goes there.
- **Man-marking.** The top `carriers` entry gets picked up at the halfway line rather than at the 23.
- **PC defence — open question 16.** With `n` above threshold and one variant dominating, the postman leaves earlier on that variant's line and the keeper sets accordingly. This is what "the opponent has read you" *is*, and it is what finally punishes running one battery all match.
- **Going long.** `pressBeaten` raises the aerial's utility over the possession outlet.
- **Keeper.** `keeperCommits` moves the attacker's preference between the flat shot and the lift over a diving keeper.

**Confidence gating is the fairness mechanism.** A read fires only when `n ≥ readThreshold(reader)`, where the threshold falls with `mental.decisions` (outfield) and `goalkeeper.pcReading` (PC defence). A weak side never reads you at all; a strong side reads you by the third corner. That is both the hockey truth and the difficulty curve.

**Determinism:** `ScoutMemory` is a pure function of the seeded run. No new RNG stream is required; any sampling it drives uses the controller's existing `Rng`. The determinism suite gets one new case: a match with reads enabled replays bit-identically from its log.

**Gate:** the `pc-dragFlick` scenario, run nine times against the same defence in one match, shows falling conversion. Calibration re-run: `pcConversion` should *fall* slightly and `pcPerMatch` should be untouched.

---

## Layer A — fitting the policy (learning, offline)

### A1 · Extract the constants
Every hand-typed number in `brain.ts`'s option scoring becomes a named field of a `PolicyWeights` record, shipped as data next to `Profile`, one set per profile:

```ts
interface PolicyWeights {
  shoot: { base; quality; pressureComposure; tempoPenalty };
  feetTarget: { base; vsCleanShot; decisions };          // "win the corner"
  pass: { base; gain; open; riskOpen; riskInCircle; lengthPenalty;
          intoCircle; into23; mentality; backwards; vision; intoOwnCircle; aerial };
  carry: { base; gain; space; pressure; elimination; intoDefenderStick; intoCircle; ownCircle; tempo };
  clear: { base; pressure; tempo; defensiveMentality };
  decisionEvery; noise; commitmentBonus; softmaxTemperature;
}
```
Default values = exactly today's constants, so A1 lands with an unchanged golden hash. Each field keeps its rule-7 hockey comment; the comments move with the numbers.

### A2 · `pnpm fit` — the optimiser
A new command in `tools/calibrate` (dev dependencies allowed there; the engine takes none):

- **Search:** cross-entropy method or CMA-ES over the weight vector. ~40 dimensions, ~60 candidates per generation, ~20 generations. Every candidate in a generation runs the **same seed set** — fair comparison, low variance, and reproducible.
- **Objective, in strict order:**
  1. **Hard constraint** — every `measured` calibration band (`allMeasuredPass`, the existing Phase 4 gate signal). A candidate that misses one is dead, whatever else it does.
  2. **Loss** — squared band-normalised distance on the remaining targets, `EST` rows down-weighted ×0.4 because nine of the fourteen are still guesses (open question 17). Plus the Poisson shape χ².
  3. **Tiebreak** — a round-robin self-play tournament among the survivors: points per match against the incumbent and against each other, at ±2 quality levels (`--spread`), both profiles.
- **Output:** `weights.mens.json` / `weights.womens.json` plus a report diffing every field against the incumbent, with the calibration table before and after. **Jan promotes; the optimiser never writes into `packages/`.**

*Why this is "learning from accumulated hockey knowledge" and not hand-waving:* the knowledge is `docs/rules/calibration-data.md` (Belgian League and FIH aggregates) and the situational verdicts. The optimiser searches; the data judges.

### A3 · A learned pitch value function (optional, after A2)
`pitchValue` is an analytic guess at a warped hockey value surface. It can instead be **measured** from our own engine: sample possession states from ~10⁴ simulated matches, label each with "did this team score within 15 s", and fit `V(x, y | end) = P(goal | possession here)` — the hockey version of football's expected-threat models, and the same Markov-chain mathematics.

Ship the fit as coefficients over the axes `valueGrid.ts` already names (progression, the 23 m step, distance outside the circle, goal angle, centrality, depth), so the existing shape tests in `valueGrid.test.ts` remain the acceptance filter: a fitted surface that does not still peak on the spot-to-post strip is rejected, not accepted. Keep the analytic version in the repo as the reference the fit must not contradict.

*This closes a loop worth naming:* the circle-warped value function is the BRIEF's "single most important modelling insight". Right now it is asserted. A3 makes the engine *derive* it — and if the derivation disagrees with the assertion, that disagreement is the most interesting bug report this project could generate.

**Gate for the whole layer:** `allMeasuredPass` true for both profiles, situational deck reviewed, `ENGINE_VERSION` bumped, goldens rebased, `docs/rules/calibration.md` republished.

---

## Layer C — the season learns (teams and players grow)

### C1 · Experience-driven development
`developSeason` today moves attribute groups by an age/potential curve modulated by facilities, coachability and life pressure. It has no idea what the player *did*. The engine already emits everything needed; aggregate it per player per season:

```ts
interface SeasonUsage {
  minutes; entriesMade; entriesDefended; duelsWon; duelsLost;
  pcsTaken; pcsConverted; shots; goals; savesFaced; tacklesWon; distanceCovered;
}
```
Then bias the per-group delta towards what was exercised: 40 corners as the flicker pulls `dragFlick`; a season of defending entries pulls `positioning` and `tackling`; a full season of minutes pulls `stamina`. Bounds stay as they are — `potential` is still the ceiling, the age curve still owns the sign.
*Hockey reason:* at club level you get better at what you are asked to do on Sunday. A talented flicker who never takes a corner does not become a flicker.

### C2 · Training focus — open question 25
One coach input per season (technical / physical / tactical / PC battery), effect ≤ ±0.3 of a level, scaled by `coachability` and facilities. Small on purpose: it must be a nudge on a career, not a cheat code. Test asserts the bound (rule 8).

### C3 · Familiarity — the cheapest big win in this document
One scalar per club per system: `familiarity[clubId][formation]` and `[press]`, 0…1, +≈0.15 per season of use, −0.10 decay, reset on a change of system. Consumed as a **multiplier on the AI's decision noise and shape error** for that team.

A squad that has drilled the same half-court press for three seasons executes it tightly. Switch them to a full-court press in July and they leak for half a season. Nothing else in this document buys that much felt continuity for one number — and it gives the coach a real cost for chopping and changing, which is exactly the decision a Belgian club coach actually faces.
*Test:* same squad, same seed, familiarity 0 vs 1 → measurably fewer turnovers and tighter shape, within a stated bound.

### C4 · Scouting across the season
Persist a decayed `ScoutMemory` per (club, opponent) pair in the save; seed layer B's memory from it at kick-off, gated by the *scouting* strength of the club (facilities/level stand in for an analyst until there is a staff model).

This is the mechanism BRIEF §5.5 promised and never got: run the same PC variant all season and by February the whole league sets up for it. Conversely a variant held back for the play-offs actually surprises people.

### C5 · AI clubs adapt their tactics
A seeded softmax bandit per AI club over the tactics presets (formation, press, mentality, build-up), updated from results and run of play (goals conceded from open play → shift the block deeper; no circle entries → shift the build-up wide). Stored in world state, deterministic, ~40 lines. Gives the league a texture that changes across a career instead of twenty clubs playing 4-3-3 half-court forever.

**Gate:** save v4 migration, a three-season career where the familiarity and usage effects are visible in the squad screen, and open questions 16/25/26 closed in KICKOFF.

---

## What must not change

- `Rng` stays the only stochastic source. No `Math.random`, no clock, no `fetch`, in any layer (CLAUDE.md rule 4).
- `packages/engine` keeps zero runtime dependencies (rule 3). Optimisers, statistics and tournament runners live in `tools/`.
- No `if (isWomens)` (rule 5): men's and women's get separate fitted weight sets, exactly as they get separate profiles.
- Every learned number keeps a name and a hockey comment (rule 7) and a test asserting its effect (rule 8).
- Pixels never enter the engine (rule 12); none of this is a rendering change.

## Test strategy (extends ADR-010)

| Layer | New tests |
|---|---|
| D | softmax→argmax limit; commitment reduces decision switches per possession; anticipation improves interception rate monotonically with `positioning` |
| B | determinism with reads enabled; conversion of a repeated PC variant falls within one match; a low-`pcReading` keeper never reads |
| A | golden unchanged after A1 (pure extraction); `allMeasuredPass` gate on any promoted weight set; fitted value surface must pass the existing `valueGrid` shape tests |
| C | development bounded by `potential`; training focus bounded at ±0.3; familiarity effect bounded and monotone; save v3→v4 migration round-trip |

## And the About page

Once layers B and C ship, the sentence Jan quoted is worth rewriting — not because "deterministic" is wrong, but because it is being read as "scripted":

> **NL** — "Een hockeycoach/managerspel met een lerende AI: teams lezen je door de match heen en je spelers groeien in wat ze effectief doen. De engine is deterministisch — dezelfde wedstrijd speelt zich altijd identiek af, zodat elke herhaling klopt en elke carrière reproduceerbaar is."

Determinism then reads as what it is — a guarantee about replays — instead of as a confession about the AI. **Leave the current wording until the behaviour is actually there.**
