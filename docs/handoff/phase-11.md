# Phase 11 — pressing systems as data, and the defence works from assignments

> **Status: not merged. `pnpm check` is green (169 tests) but the calibration gate regressed and the
> phase is half-built by design of its own spec.** Read § "Why this is not merged" before anything else.

## What was built

`docs/design/hockey-systems.md` §2–§4, the defensive half:

- **`PRESS_SYSTEMS` in `tactics.ts`** — full / half / split / zone as records of values: `initiator`,
  `commit`, `scheme`, `freeMan`, `restBreak`, `lateralShift`, `trap`, `shepherd`. No branch per
  system anywhere. `pressHeight` still owns *where* we engage; these own *who does what*.
- **An assignment model in `brain.ts`** — `pressBall` / `cover` / `markMan` / `free` / `restBreak` /
  `markZone`, resolved once per tick by `assign()`. The presser is the **owner of the ball's channel
  on the initiating line**, not the nearest body on the pitch. Inside our own 23 channel discipline
  stops applying and the nearest player goes: a back holding his channel while the ball sits on the
  spot is not disciplined, he is watching a goal.
- **Sticky marking** — a mark is handed over only when a teammate has been more than 2 m closer for
  half a second, and *standing marks are reserved before any new one is handed out*.
- **The system governs off the ball too** — `looseBall` used to fall back to formation shape, so the
  pressing system only steered the team while an opponent was physically dribbling. A ball in flight
  is most of a hockey match.
- **Anyone within reach may tackle**, with the presser keenest. Channel discipline decides who steps
  out of shape, not who may touch the ball at their feet.

Engine **0.7.0**; sandbox golden `cec18ab670a0562b`, scenario goldens regenerated (reviewed:
`high-press-vs-deep-block` reads as build-up with shape, not as a scramble).

## Why this is not merged

**Goals per match fell out of the calibration band.** Same batch, 96 matches, ±2 spread:

| mens | main | this branch | band |
|---|---|---|---|
| goals per match | **5.49 ok** | **4.33 MISS** | 4.86 – 5.94 |
| share of goals from PC | 0.15 MISS | 0.16 MISS | 0.25 – 0.40 |
| penalty corners | 4.31 MISS | 4.55 MISS | 6 – 12 |
| circle entries | 12.75 MISS | 12.10 MISS | 26 – 48 |

`allMeasuredPass` was already NO on main (the PC goal share misses), so this does not break a passing
gate — but it moves a *measured* row out of band that was in it, and that is a regression whatever
the surrounding state.

The cause is not mysterious and it is not a bug: **the defensive half of the phase shipped without
the attacking half.** Both sides now defend with a free man, a rest-break and marks that stay marked,
and the attack has been given nothing new to beat them with. §7 of the spec — circle-entry patterns,
passing into space via a pursuit test, up-back-through — is exactly the missing counterweight, and it
is in the same phase in the spec for this reason. Splitting them was my call and it was the wrong one.

**Two honest ways forward, Jan's choice:**
1. **Finish the phase** — build §7 on this branch, re-calibrate, merge when goals are back in band.
   This is what the spec intends and my recommendation.
2. **Merge the defensive half and re-tune** — accept the drop as the new baseline and let the fitting
   layer (ADR-014 layer A) find the weights that restore it. Faster, but it tunes around a known
   half-built model instead of finishing it.

## What surprised me

- **The pressing system was steering a fraction of the match.** `defend()` only ran while an opponent
  had the ball at their stick; every other tick went through `looseBall`, which held formation shape.
  Fixing that mattered more than any single system value.
- **Sticky marking is defeated by processing order.** Reserving held marks *after* handing out new
  ones lets an earlier runner steal a defender who is already on someone; the line then swaps men at
  10 Hz and nobody ever arrives. Reserve first, fill second.
- **A single seed will tell you whatever you want to hear.** "A zone block does not chase" measured a
  23 % gap on seed 42 and vanished (2.05 vs 2.07) when averaged over two. Every assertion in
  `press.test.ts` is averaged over two seeds because of it.
- **Better shape did not cost circle entries.** At 16 matches entries rose 11.6 → 13.5; at 96 they are
  12.1 vs 12.75, i.e. flat. The entries problem (12 against a target of 36) is untouched by any of
  this and belongs to §7.

## What the next phase should watch out for

- **Marking is assigned but does not arrive.** 171 k `markMan` assignments in one match, yet only
  ~19 % of their players in our half have one of ours within 3 m, and that share does not separate
  `full` (man-to-man) from `zone` (zonal). Either the closing behaviour is too slow, or the metric is
  wrong. Do not assume the resolver is at fault — it demonstrably assigns.
- **`commit` may not be doing enough.** It chooses who is *labelled* the presser; it does not stop
  anyone else drifting ballwards while recovering into shape. That is why the "does not chase"
  assertion is documented in `press.test.ts` as deliberately not asserted rather than quietly dropped.
- **`shepherd: 'toReverse'` is still geometry only.** It behaves as `toInside` until phase 11b gives
  the engine stick handedness. The value is in the data so the systems are complete; the behaviour
  is not there yet.
- The `PressSystem` fields the spec lists but this phase does not implement — `triggers`,
  `blockDepth`, `recovery` — were deliberately left out rather than shipped as decoration
  (CLAUDE.md rule 10). Add them when they can be computed honestly.

## Files

- `packages/engine/src/ai/tactics.ts` — `PressSystem`, `PRESS_SYSTEMS`, `channelOf`, `lineOf`; the
  lateral squeeze now comes from `lateralShift`.
- `packages/engine/src/ai/brain.ts` — `Assignment`, `DefenceState`, `assign()`, rewritten `defend()`,
  `tryTackle()`, `trapIfArriving()`, `looseBall()` holds the system.
- `packages/engine/src/ai/press.test.ts` — new, relational, two seeds per measurement.
- `packages/engine/src/constants.ts` — `ENGINE_VERSION` 0.7.0.
- `packages/engine/src/sim/golden.ts`, `packages/engine/src/sim/scenarios.golden.json` — regenerated.
- `docs/adr/ADR-014-adaptive-play-and-learning.md`, `docs/adr/README.md` — Accepted.
