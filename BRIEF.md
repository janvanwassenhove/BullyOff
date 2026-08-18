# BULLY OFF — Project Brief

> Title locked: **BULLY OFF**. Repo slug `bullyoff`.

**Audience:** Claude Fable 5, acting as lead engineer on a greenfield repo.
**Author:** Jan Van Wassenhove (mITy.John)
**Status:** Committed at repo root alongside `CLAUDE.md` and `KICKOFF.md`.

---

## 0. TL;DR

Build a **field hockey game** for the web: a deterministic, headless match simulation engine in TypeScript, with two front-ends sharing that engine — a **coach/manager simulation** (primary product) and a **top-down arcade match** (secondary, and a testbed for the renderer).

The market gap is real: there is no credible field hockey management sim, and existing arcade attempts are shallow. The moat is not licensing or graphics — it is **hockey-accurate simulation**, in a sport that every existing sports game models as "football with different rules". It is not.

---

## 1. Non-negotiable constraints

These are hard rules. Violating any of them is a failed deliverable.

| # | Constraint |
|---|---|
| C1 | **No git operations by agents.** Never run `git add`, `commit`, `push`, `branch`, `merge`, `rebase`, or `tag`. Write files; Jan commits. State clearly at the end of each phase what changed. |
| C2 | **The engine is headless and deterministic.** Same seed + same inputs = byte-identical event log. No `Math.random()`, no `Date.now()`, no direct DOM access anywhere in `packages/engine`. |
| C3 | **No real player data ships.** All persons in shipped builds are procedurally generated fiction. See §7 (GDPR). |
| C4 | **Web-first.** The product must run in a mobile browser from a shared link. Desktop and native wrappers are later, optional, and must reuse the same codebase. |
| C5 | **Strict monorepo, strict TypeScript.** `strict: true`, no `any` outside typed third-party shims, no implicit `any`, ESLint clean. |
| C6 | **Phase gates.** Do not start phase N+1 until phase N's acceptance criteria pass. Each phase ends with a handoff note. |

---

## 2. Product thesis

**Why this exists.** Field hockey is a top-5 global team sport with a serious competitive structure (Belgium, Netherlands, Germany, India, Australia, Argentina) and effectively zero credible software. Hockey people are structurally underserved and structurally engaged — clubs, coaches, parents, youth players.

**Why it's not a football reskin.** The mechanics that define hockey have no football equivalent:

- **Unlimited rolling substitutions** — squad rotation is a *live, continuous* tactical decision, not a pre-match plan with three swaps.
- **The circle rule** — goals only from inside the shooting circle. This warps the entire spatial value model of the pitch. Possession in midfield is worth far less than in football; entries into the D are the currency.
- **The penalty corner** — a designed, rehearsed, high-conversion set piece. Roughly a third of all goals. It is essentially a minigame that deserves its own design surface.
- **No offside** — since 1998. Completely different defensive shape and pressing logic.
- **Four quarters** — three natural coaching interventions, not one half-time.
- **Green/yellow cards** — temporary suspension (2 min / 5+ min) makes discipline a resource to manage, not a binary punishment.
- **Self-pass** — restarts are fast; the ball is rarely dead for long.
- **Surface state** — wet vs dry turf materially changes ball speed and friction. Watering the pitch is a real pre-match decision.

**The hook is not names.** Football managers lean on recognisable players. Hockey's star culture is *national*, not club-level, and club hockey is semi-amateur with almost no transfer market. The FM loop of scout-buy-sell is the wrong model. What remains — coaching, rotation, youth development — is entirely name-independent. Basketball GM and OOTP prove a fully fictional world can carry emotional weight.

---

## 3. Scope

### In scope (v1.0)

1. Deterministic headless match engine with hockey-accurate rules.
2. Manager/coach campaign: season loop, squad, training, youth development, in-match coaching.
3. 2D top-down match viewer (watch, not control) with speed control and auto-pause.
4. Procedural world generation: clubs, players, 20 seasons of backstory.
5. Local persistence, PWA, offline-capable.
6. NL / EN / FR localisation.

### In scope (v1.x, after v1.0 ships)

7. Arcade mode: player-controlled top-down match, same engine, same renderer.
8. Editor + open data format for community-made leagues.
9. Club mode: local-only real squad entry (coaching tool, never synced).

### Explicitly out of scope

- Multiplayer / netcode of any kind in v1.
- 3D rendering, broadcast cameras, replays from arbitrary angles.
- Monetisation, accounts, telemetry, analytics, ads.
- Any server-side component. v1.0 is a static site.
- Indoor hockey (different sport, different rules — later, maybe).

---

## 4. Architecture

### 4.1 Repo layout

```
bullyoff/
├── BRIEF.md                  ← this document
├── CLAUDE.md                 ← agent operating rules
├── KICKOFF.md                ← current phase, open questions
├── docs/
│   ├── adr/                  ← architecture decision records
│   ├── rules/                ← hockey ruleset spec, calibration targets
│   └── handoff/              ← per-phase handoff notes
├── packages/
│   ├── engine/               ← headless sim. ZERO deps. Pure TS.
│   ├── rules/                ← hockey ruleset, separable from physics
│   ├── worldgen/             ← clubs, players, history, name pools
│   ├── shared/               ← types, seeded RNG, math, units
│   └── render/               ← PixiJS view layer. Reads event logs.
├── apps/
│   ├── manager/              ← Vue 3 — the product
│   ├── arcade/               ← Vue 3 — v1.x
│   └── simcli/               ← Node CLI — batch sim & calibration
└── tools/
    └── calibrate/            ← stat comparison harness
```

pnpm workspaces. Vite. Vitest. Vue 3 `<script setup>` + Pinia. No CSS framework — hand-rolled design tokens.

### 4.2 The critical boundary

```
┌──────────────────────────────────────────┐
│  packages/engine                         │
│  · tick(state, inputs) → state, events   │
│  · pure, synchronous, deterministic      │
│  · no I/O, no timers, no randomness      │
│    except the injected seeded RNG        │
└────────────────┬─────────────────────────┘
                 │ MatchEvent[]  (the only output)
    ┌────────────┼────────────┬─────────────┐
    ▼            ▼            ▼             ▼
 render      manager       simcli        arcade
 (Pixi)      (Vue)         (Node)        (Vue)
```

**The event log is the contract.** The engine emits a stream of typed events. Everything downstream — the Pixi viewer, the commentary, the post-match stats, the calibration harness — consumes that log and nothing else. The renderer never reaches into engine state.

Consequences that make this worth the discipline:

- The whole match is replayable, seekable and shareable as data.
- Batch simulation of 10,000 matches is trivially possible (that is how you calibrate).
- Swapping Pixi for three.js, or the web for Unity, becomes a renderer decision, not a rewrite.
- Bug reports are a seed plus an input log. Perfectly reproducible.

The engine runs in a **Web Worker** in the browser apps.

### 4.3 Determinism rules

- Single `Rng` class, xorshift128+ or PCG32, seeded, serialisable. Injected, never global.
- No floating-point drift across platforms: prefer fixed-point where accumulation matters, or accept float but **assert** the determinism harness in CI.
- **Fixed tick rate: 20 Hz (dt = 0.05 s). Decided.** This makes continuous collision detection mandatory, not optional — see §5.2.1.
- Iteration order over collections must be stable. No `Set`/`Map` iteration that depends on insertion timing; sort explicitly where order matters.
- Determinism harness in CI: run a fixture match 100×, hash the event log, fail on mismatch.

### 4.4 Numeric representation — float64, with guardrails

**Decision: IEEE-754 float64 throughout the engine.** Fixed-point is the solution to a problem this project does not have (see §4.5), and it costs real development speed on every line of physics code.

JavaScript's basic arithmetic (`+ - * /`) is strictly specified and produces identical results on every conforming engine. The risk is elsewhere, and it is narrow:

- `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2`, `Math.pow`, `Math.exp`, `Math.log` are **implementation-defined in precision**. V8, JavaScriptCore and SpiderMonkey may and do differ in the last bits.
- `Math.sqrt` is specified exactly. It is safe.

Mandatory guardrails, implemented in Phase 1 — cheap now, an expensive refactor later:

1. **Ban `Math.*` transcendentals in `packages/engine`** via an ESLint `no-restricted-properties` rule. Provide own implementations in `packages/shared/math`: a lookup-table sin/cos with interpolation, own `atan2`, own `pow` for the few exponents actually used. Faster as a bonus.
2. **Route every simulation quantity through a `Scalar` type alias.** Today `type Scalar = number`. If the representation must ever change, that is one file and a compiler-guided refactor, not a thousand call sites.
3. **Run the determinism harness in CI on Chromium, Firefox and WebKit**, not only Node. Hash the event log; fail the build on divergence.
4. **Serialisable, tick-stamped input commands from day one.** Required for replay, and identical to what any future networked mode needs.
5. Avoid accumulating error where it compounds: derive elapsed time from `tick × dt`, never by summing `dt`.

### 4.5 Multiplayer posture — server-authoritative

Multiplayer is out of scope for v1.0, but the architectural door must be left open in the right place. That place is the network model, not the number format.

**Decided: if multiplayer ships, it is server-authoritative. Never peer-to-peer lockstep.**

| Model | Who simulates | Needs cross-machine determinism |
|---|---|---|
| Async manager league | server, once per fixture | no — distribute the event log |
| Server-authoritative arcade | server | no — clients render only |
| P2P lockstep arcade | every client independently | **yes, absolutely** |

Only the third row requires bit-identical floating point across browsers, and it is the model this project should not use anyway: input delay is bound to the slowest peer, and a single disconnect stalls everyone.

The event-log contract in §4.2 already fits the async league model exactly — simulate once server-side, ship the log, every client replays it identically because it is the *same log*, not a re-derivation.

Implication for the stack: v1.0 remains a static site with no backend. If multiplayer arrives, Supabase is the presumed platform (already in use elsewhere in the mITy estate), and it becomes a new ADR with its own privacy notice — see §7.

---

## 5. The simulation model

### 5.0 Two competitions — men's and women's. Decided.

Both ship in v1.0. They are **two parallel worlds sharing one engine**, not one world with a flag.

What is shared: the rules, the physics, the pitch, the event log, the renderer, the entire code path. Hockey's laws are identical, which is exactly why this is affordable at all.

What is **not** shared, and must be separated in data from day one:

- **Calibration parameter sets.** Two named tuning profiles, `mens` and `womens`, loaded by the engine as configuration. Never pooled, never averaged. Pooling them produces a model that is wrong for both.
- **Attribute distributions and physical scaling.** Ball speeds, sprint speeds and drag-flick velocities differ; these belong in the profile, not hardcoded in physics.
- **Name pools.** Separate first-name pools per gender, shared surname pools per nationality.
- **League structures, fixtures, tables, histories.** Two independent two-tier pyramids with their own twenty-season backstory.

Implementation rule: **no `if (isWomens)` branches in `packages/engine`.** Every difference is a value in a loaded profile. If a difference cannot be expressed as a parameter, that is a design flaw to raise, not a branch to write. This keeps the engine honest and makes adding a third profile — youth, indoor, veterans — nearly free later.

Career mode consequence: the coach picks a competition at the start. Coaching across both within one save is out of scope for v1.0.

**Cost, stated plainly:** this roughly doubles Phase 4's transcription and tuning work and Phase 8's generated world size. It does not meaningfully increase engine complexity if the parameter discipline above holds. If Phase 4 stalls, shipping men's first and women's as a post-v1.0 profile is the fallback — the architecture must keep that escape hatch open.

### 5.1 Pitch and units

Real dimensions, SI units internally, metres and seconds:

- Pitch 91.4 × 55.0 m
- Shooting circle: quarter-circles of radius 14.63 m from each goalpost, joined by a 3.66 m straight
- Goal 3.66 m wide × 2.14 m high
- 23 m lines, penalty spot at 6.40 m
- Ball mass ~160 g, diameter ~72 mm

Do not use pixels anywhere in the engine. Conversion to screen space happens only in `render`.

### 5.2 Ball: 2.5D

Track `x, y, z` plus velocity and spin. Hockey balls genuinely leave the ground — aerials, scoops, drag flicks, deflections — and height determines legality (dangerous play, above-shoulder rules). This cannot be faked with a shadow offset if you want rule-correct outcomes.

Friction is a function of **surface state** (`dry` / `watered` / `wet`) — a watered pitch is materially faster and truer. This is a pre-match decision the home club makes, and it must have real mechanical consequence.

#### 5.2.1 Continuous collision detection — required

At 20 Hz a struck ball travels a long way per tick. A hard hit or drag flick at ~100 km/h covers **~1.39 m per tick**; elite hits reach 130 km/h, or ~1.8 m per tick. Discrete per-tick position checks will tunnel the ball straight through the goal mouth, the backboard, the posts and player bodies — the fastest, most decisive events in the sport would be exactly the ones the engine gets wrong.

Therefore, in Phase 1:

- Model each tick's ball movement as a **swept segment** from previous to next position, not as a point sample.
- Test that segment against goal plane, posts, backboard, sideboards, and player/stick capsules. Resolve at the **earliest time of impact**, then continue the remainder of the tick with the post-collision velocity. Multiple collisions within one tick must resolve in temporal order.
- Circle entry and goal-line crossing are detected on the **swept path**, never on endpoint sampling. A goal must never be missed because the ball was outside the goal at tick *n* and behind the backboard at tick *n+1*.
- The same applies to the 23 m lines and sidelines for out-of-play detection.
- Cap the number of resolved collisions per tick (say 4) to guarantee termination, and log an event if the cap is hit — that is a bug signal, not a normal outcome.

Player and stick movement stays discrete; players do not move fast enough to tunnel at 20 Hz. Only the ball needs sweeping.

**Phase 1 acceptance test:** a ball fired at 130 km/h from 14 m at the goal registers a goal on every tested angle, and a ball fired at the post rebounds rather than passing through.

### 5.3 Players

Per-player continuous state: position, velocity, stamina, and a stick with an orientation. Attributes on a 1–20 scale, grouped:

- **Technical** — first touch, trapping, push pass, slap, hit, drag flick, 3D skills, elimination, tackling
- **Physical** — pace, acceleration, stamina, strength, agility
- **Mental** — vision, decisions, positioning, composure, work rate, aggression, discipline
- **Goalkeeper** — separate set: reflexes, positioning, kicking, aerial, one-on-one, PC reading

Hidden attributes: potential ceiling, injury proneness, consistency, big-match temperament, coachability, ambition, and **life pressure** (studies, work, family) — this last one is the amateur-hockey-specific attribute that drives realistic drop-off at 17–18 and at 25.

### 5.4 Player AI

Utility-based decision making, evaluated per tick, not scripted plays:

1. Each player scores candidate actions (carry, pass to N teammates, shoot, tackle, press, drop, support) against a weighted utility function.
2. Weights derive from attributes, current tactical instruction, fatigue, and score/time state.
3. The **circle rule warps the pitch value function** — this is the single most important modelling insight. Build a spatial value grid where value rises steeply near and inside the D, and passing lanes into the circle are the highest-value objects on the pitch. If you model hockey with a football value grid, everything downstream feels wrong.

### 5.5 The penalty corner as a first-class subsystem

Model it as its own phase machine, not as a generic set piece:

- **Attack**: injector, trapper (stopper), striker/flicker, 2–3 runners, plus a designed variant
- **Defence**: goalkeeper, first runner (postman), left/right post, and one free defender
- Resolution: injection quality → trap quality → the race between the first runner and the strike → the strike itself → deflection/rebound chain

Variants are **assets the coach builds, trains and wears out**: straight drag flick, low hit, slip to the right, drag-and-slip, deflection at the near post, indirect. Opponents build a read on your tendencies across a season. Reusing one variant every time must be punished.

Target: penalty corners produce roughly a third of all goals (validate against calibration data in Phase 4).

---

## 6. Calibration — the phase most projects skip

The difference between "feels plausible" and "is right" is measurement.

Build `apps/simcli` early. It runs N matches headless and emits aggregate statistics. Then compare against real published data (FIH tournaments, Belgian Hockey League, EHL, Pro League — all publicly reported aggregates, no personal data required).

Calibration targets to hit, per match:

| Metric | Notes |
|---|---|
| Goals per team per match | Establish from public league data |
| Penalty corners awarded per match | And their conversion rate |
| Share of goals from PC / open play / penalty stroke | PC share should be substantial |
| Circle entries per match | And entry-to-shot conversion |
| Green/yellow/red card frequency | |
| Shot count and on-target rate | |
| Distribution of scorelines | Not just the mean — the *shape* matters |
| Draw rate | Drives shoot-out frequency in play-offs (Phase 6) |
| Shoot-out conversion rate | Needed before play-offs can be tuned at all |

Do not proceed past Phase 4 until the simulated distributions sit within tolerance of the real ones. Document the targets and the achieved values in `docs/rules/calibration.md`.

### 6.1 Sources — decided

Two, deliberately, because they measure different things:

**Belgian League (Belgian Hockey League / Men's & Women's top division)** — the domestic reference. This is the competitive level the default fictional world models, so it sets the baseline for scoreline distribution, PC frequency and card rates in a *league* context with uneven team quality.

**FIH Pro League** — the international reference. Higher standard, better-documented match statistics, and a much tighter quality spread between teams. Useful precisely because it is *different*: it tells you how the metrics should shift as squad quality converges and rises.

How to use them together: Belgian League fixes the absolute values for club-level play. Pro League validates that the model responds correctly to a change in quality distribution — if you feed the engine two elite, evenly matched sides and it does not move toward Pro League numbers, the model is fitted rather than causal. That distinction is the whole point of calibrating.

Practical notes:

- Transcribe into `docs/rules/calibration-data.md` as a plain table with source and season noted per row. Aggregate statistics only — no individual player data (§7).
- Record the sample size per metric. A PC conversion rate from 40 matches carries different weight than one from 400.
- Record men's and women's separately — **both are in scope (§5.0)**, so this is two full transcription passes, not an optional refinement. Pooling them will mislead the tuner and produce a model wrong for both.
- Tolerance bands, not point targets. Propose ±10% on frequencies, and a chi-square-style shape check on the scoreline distribution rather than matching the mean alone.

### 6.2 Situational fidelity — the second, harder validation

Statistical calibration (§6, §6.1) proves the *aggregate* is right. It does not prove any individual passage of play looks like hockey. A model can hit every metric in the table and still produce nonsense frame by frame — right number of circle entries, arrived at in ways no coach recognises.

So there are two acceptance layers, and both are mandatory:

**Layer 1 — statistical.** Automated, measurable, runs in CI. Covered in §6.

**Layer 2 — situational.** Human, qualitative, and the thing that actually decides whether this project is credible. Build a **scenario test suite**: fixed seeds and fixed starting states that reproduce named hockey situations on demand. Play each one back in the viewer and have it judged by coaches.

Scenarios to cover, at minimum:

| Situation | What must look right |
|---|---|
| Outlet from the back under press | Goalkeeper and backs building out; the ball going long when the press wins |
| High press vs deep block | Shape holds, gets stretched, recovers — not chaos |
| Circle entry from the baseline | Entry, pull-back to the top of the D, strike |
| 2v1 and 3v2 in the circle | Overload resolved sensibly, not by dribbling into three defenders |
| Penalty corner, each variant | Injection, trap, runner race, strike, rebound chain |
| Defending a PC one man down | After a green card — the compromise must be visible |
| Last two minutes, one goal down | Goalkeeper off for a kicking back, all-out pressure |
| Counter-attack from a turnover | Transition speed; the moment of decision |
| Long corner | Correct restart, correct shape |
| Shoot-out | One-on-one, eight seconds, keeper advance |

Each scenario is a fixture file: seed, initial state, tactical instructions. Any of them can be replayed at any time, and a change that breaks one is a regression.

**The review panel.** This is where your coaching context is the project's unfair advantage. Recruit three or four coaches — including people who are not you and will not be polite. Show them scenario replays. The question is never "is this fun" but "**is this hockey**". Record verdicts in `docs/rules/situational-review.md` with the seed, the verdict and the fix.

Rule: **a scenario the panel rejects blocks the phase gate**, exactly as a failed statistical tolerance does. There is no substitute for this and no automated proxy for it.

---

## 7. GDPR — a hard design constraint

Field hockey clubs are full of minors. Assigning attribute scores to a real named 16-year-old and shipping it commercially is processing of personal data concerning a child. This is not a licensing negotiation like football clubs — it is a legal wall.

Rules:

- Shipped builds contain **only generated fictional persons**. Name pools are weighted by nationality; generated names are checked against nothing and claim nothing.
- Generated club names must not collide with real clubs. Maintain a blocklist of real club names in `worldgen` and reject collisions at generation time.
- **Club mode** (v1.x) may let a coach enter their own squad. That data is written to local storage only, never transmitted, never included in exports shared by default. Add an explicit warning in the UI. This makes it a coaching tool operating under the club's own lawful basis, not our processing.
- No accounts, no telemetry, no analytics in v1. If that ever changes, it is an ADR and a privacy notice, not a config flag.

Convenient truth: the constraint forces the design that was better anyway.

---

## 8. Phases

Each phase: deliverables, acceptance criteria, and a handoff note in `docs/handoff/phase-N.md`. Do not proceed on a red gate.

### Phase 0 — Foundation and decisions

Scaffold the monorepo. Write the ADRs *before* writing engine code.

ADRs required:

- ADR-001 Web-first over Unity / native — record the reasoning and the exit conditions that would reverse it
- ADR-002 Headless deterministic engine, event log as sole contract
- ADR-003 PixiJS as renderer (vs Phaser, three.js + Rapier)
- ADR-004 2.5D ball model
- ADR-005 Numeric representation — **decided: float64**, with mandatory guardrails (see §4.4)
- ADR-006 Fictional-only world, GDPR posture
- ADR-007 Persistence format and save-versioning strategy
- ADR-008 State management and worker boundary
- ADR-009 i18n approach (NL/EN/FR from day one, no retrofit)
- ADR-010 Testing strategy: unit, determinism harness, calibration harness
- ADR-011 Multiplayer posture — **decided: server-authoritative, never P2P lockstep** (see §4.5)
- ADR-012 Art direction and asset pipeline — Blender-to-sprite, layer separation, atmosphere (see §10)
- ADR-013 Presentation and camera language — interpolation, dynamic framing, moment budget, audio (see §10)

**Gate:** repo builds, lints, tests green on an empty suite. Thirteen ADRs written and each one actually argues a trade-off rather than restating the decision.

### Phase 1 — Engine core

Pitch geometry, ball physics with height, player kinematics, stick as an oriented segment, tick loop, seeded RNG, event log type system, Web Worker harness, determinism test.

**Gate:** 100 runs of a fixture scenario produce identical log hashes. A ball pushed at a known velocity on a known surface stops where physics says it should. No rules yet — this is a hockey-shaped physics sandbox.

### Phase 2 — Rules layer

Circle rule, no offside, obstruction, foot/body contact, dangerous play by ball height, back-stick, self-pass, free hits and the 5 m rule, 23 m restarts, long corners, penalty corners, penalty strokes, cards with timed suspension, four quarters and clock stoppage, unlimited rolling substitutions.

**Gate:** a rules test suite where every rule has at least one positive and one negative case. A match can be played start to finish without a rules violation escaping unhandled.

### Phase 3 — Players and AI

Attribute model, utility-based decision layer, the spatial value grid, team tactical instructions (press height, defensive line, build-up style, PC preferences), fatigue and its effect on decisions, goalkeeper AI as a distinct model.

**Gate:** matches produce recognisable hockey shape — sustained circle pressure, counter-attacks, defensive resets — verified by watching event logs in text form. Coach's judgement is the acceptance criterion here; there is no substitute. Build the scenario fixtures from §6.2 in this phase, even though they cannot be judged visually until Phase 5.

### Phase 4 — Calibration

`simcli`, batch runner, statistics aggregation, comparison harness against documented real-world targets, tuning pass — **run twice, once per competition profile (§5.0)**.

**Gate:** all metrics in §6 within documented tolerance, **independently for `mens` and `womens`**. `docs/rules/calibration.md` published with targets, achieved values and known deviations per profile. Verify that switching profile changes only loaded configuration — no engine code path differs between the two.

**This is the make-or-break gate. Everything after it is presentation.**

### Phase 5 — Renderer

Pixi view layer consuming event logs. Tiled turf with vector-drawn lines, wet/dry visual state, modular player sprites (body / stick / shadow as separate layers), runtime tinting for club colours, ball with height-derived shadow offset, camera follow, speed control, scrub and seek, auto-pause triggers.

**Presentation is a first-class deliverable here, not decoration — see §10.** Interpolation, camera behaviour, lighting and the moment-of-goal treatment belong in this phase, not in a later polish pass.

**Gate:** any saved event log can be replayed frame-accurately, scrubbed backwards and forwards, at 1× through 8×, on a mid-range phone at 60 fps. Motion is smooth at every speed — no visible 20 Hz stepping. A goal *feels* like a goal.

### Phase 6 — Manager shell

Season structure, fixture generation, league tables, squad management, training focus, youth academy and progression, player development and decline, injuries, the amateur-hockey pressures (studies, availability, volunteers), club finances at an honest amateur scale.

**Season shape — decided: play-offs are in scope, and built first.**

Build the season as **regular phase → play-off phase**, in that order, from the very first line of Phase 6. Do not build a table-decides-the-title league and bolt play-offs on afterwards. The two demand different things from the surrounding systems, and retrofitting the second onto the first is the kind of rework that eats a phase.

Why it must come first:

- **Squad management inverts.** In a regular season you manage load across thirty-odd fixtures; in a knockout you spend everything on one match. Rotation, fatigue and the risk of playing a tired key player mean opposite things in each phase. If the model is only ever tuned against the regular season, play-offs will feel like more of the same — which is the one thing they must not feel like.
- **The regular season becomes qualification, not the goal.** Finishing fourth with a good draw can beat finishing first. That changes what the coach optimises for in February, which is a *better* game and a harder one to add later.
- **Fixture generation must be two-mode from the start**: round-robin generation, and bracket generation seeded from final standings. Different data shapes, different persistence.

Structure to model (Belgian-shaped, confirm the current format when transcribing calibration data):

- Regular round-robin phase, autumn/spring with a winter break
- **Title play-offs** — top placings enter a knockout bracket; semi-finals and final decide the champion
- **Relegation play-offs / play-downs** at the bottom, interacting with the second tier's promotion places (§ Phase 8)
- Support both single-match and two-legged ties in the bracket model, plus shoot-outs as the tie-breaker — hockey resolves draws by shoot-out, not extra time in most competitions

The winter break is not cosmetic: it is a training block, a recovery window and the point where injured players return. Model it as a real interval, not a gap in the fixture list.

**Gate:** ten seasons can be simulated end to end without corruption, including play-off brackets, shoot-out resolution, and promotion/relegation flowing correctly between tiers. Youth players emerge, develop, plateau and retire believably. A season where the regular-phase winner loses the play-off final must be possible and must feel earned, not random.

### Phase 7 — In-match coaching

The rotation bar with live stamina and drag-to-substitute. Penalty corner designer and in-match variant selection. Card management under numerical disadvantage. Quarter-break briefings. Three view modes: commentary-only, 2D pitch, 2D plus live stats.

**Gate:** a full match is genuinely engaging to coach. If the tester can look away for a quarter and lose nothing, the design has failed and must be revised before Phase 8.

### Phase 8 — World generation

Nationality-weighted name pools, club generation with the real-club blocklist, twenty seasons of generated history (champions, club legends, a club that once went down and never came back), league pyramid, reputation model.

**League structure — decided: two tiers, per competition.** A Belgian-shaped pyramid of a top division plus one division below it, with promotion and relegation between them. **Two such pyramids — men's and women's (§5.0) — generated independently.** No third tier: it costs simulation time per season and adds almost nothing a player will notice.

Two tiers is the minimum that makes relegation *mean* something, and it is what gives the coach career its shape — start at a second-division club, earn the top flight, then try to survive it. A single division would make the whole promotion/relegation mechanic dead weight.

Design consequences to respect:

- The gap in quality, budget and facilities between the tiers must be visible, not cosmetic. Second-tier squads should feel materially thinner — fewer usable substitutes, which directly bites through the rolling-rotation mechanic.
- Relegated clubs lose players; promoted clubs are overmatched in their first season. Model both.
- A demoted club that never recovers is one of the best pieces of generated history you can produce. Make sure the twenty-season backstory can produce one.

**Gate:** a freshly generated world reads as though it has been lived in. History has texture, not just a table of winners. Promotion and relegation resolve correctly across ten simulated seasons with no orphaned or duplicated clubs.

### Phase 9 — Ship

PWA, offline, save/load with migration, NL/EN/FR complete, onboarding, accessibility pass, performance budget, deploy to GitHub Pages behind Cloudflare.

**Gate:** installable, works offline, tested by real hockey people who are not Jan.

---

## 9. Agent operating rules (→ `CLAUDE.md`)

1. **Never run git commands.** Write files, report changes, stop.
2. Read `KICKOFF.md` first. It holds the current phase and open questions.
3. One phase at a time. Do not scaffold ahead.
4. Engine code has zero runtime dependencies. If a dependency seems necessary, raise it as an ADR instead of installing it.
5. Every non-obvious modelling choice gets a comment explaining the *hockey* reason, not the code reason.
6. Tests before tuning. A magic constant without a test asserting its effect is a bug waiting to happen.
7. When a hockey rule is ambiguous, stop and ask. Do not invent rules — this project's only real asset is being right about the sport.
8. Prefer deleting to abstracting. This is a solo project; premature generality is the enemy.
9. At the end of each phase, write `docs/handoff/phase-N.md`: what was built, what was decided, what surprised you, what the next phase should watch out for.

---

## 10. Art direction and presentation

The stated bar is **stunning** — the player must be pulled in. That is a legitimate goal, but it needs an honest definition, because "stunning" means two very different things and only one of them is reachable here.

### 10.1 What stunning cannot mean

It cannot mean photoreal broadcast 3D. That is a team of artists and a multi-year budget, and pursuing it would invalidate ADR-001 and ADR-003 — you would be in Unity, off the web, shipping to Steam, and eighteen months from a first playable. Every decision in this brief was made against that trade.

### 10.2 What stunning does mean

It means **immersion through motion, atmosphere and moment** rather than polygon count. The games that swallow people whole at this scale — Football Manager's match engine at its best, *Mini Motorways*, *Dorfromantik*, *TOEM* — win on coherence and feel, not fidelity. A perfectly art-directed 2.5D pitch beats a mediocre 3D one, every time, and it is achievable solo.

Three levers carry almost all of the immersion:

**1. Motion quality.** This is the single biggest one, and it is engineering rather than art. The engine ticks at 20 Hz; the renderer draws at 60+. **Interpolate between ticks** — never draw raw tick positions. Ease player turns, let the stick swing through its arc, give the ball proper spin and a shadow that tightens as it descends. Smooth motion reads as expensive; stepped motion reads as cheap regardless of how good the sprites are.

**2. Camera as a storyteller.** A fixed overhead view is a spreadsheet with grass. Instead: dynamic framing that tightens as play enters the circle and pulls back on a turnover, subtle lead based on ball velocity, a slight zoom punch on a strike, and a brief slow-motion hold on a goal. Camera work is cheap in code and enormously expensive-looking.

**3. Atmosphere over detail.** At top-down scale, nobody sees a face. What they feel is light and weather. Time-of-day lighting, long shadows on an autumn afternoon, rain on a watered pitch with spray off the ball, floodlights and breath in the cold, subtle crowd presence on the sidelines. All of it is shader and particle work in Pixi, none of it is character art.

### 10.3 The pipeline decision

**Render the sprites from 3D.** Model one player and one goalkeeper in Blender, rig them, animate them, then batch-render top-down sprite sheets at the required angles. Palette-swap kits at runtime.

This is the decision that makes "stunning" affordable. You get consistent lighting, correct shadows and proper anatomy for free, and adding an animation later becomes a render job rather than a redraw. For someone who would rather build systems than push pixels, it is strictly the better deal — and it leaves a genuine 3D path open later, because the source assets already exist.

Layer separation still holds: body, stick, shadow and ball stay independent, and the stick rotates in code.

### 10.4 The moment budget

Immersion concentrates in a handful of moments. Spend disproportionately on them:

- **The goal.** Slow-motion hold, camera punch, net ripple, crowd swell, a beat of silence before the scoreboard updates.
- **The penalty corner.** Play stops, camera tightens on the injection, the whole thing plays out at a different tempo. It is hockey's set-piece theatre — treat it as such.
- **The shoot-out.** One attacker, one keeper, eight seconds. This should be almost unbearable.
- **The final whistle** of a season-defining match.

Everything else can be efficient. These four cannot.

### 10.5 Sound is half of it

A brief about stunning visuals that ignores audio is a brief that will disappoint. The crack of a hit on a dry pitch, the wet slap on a watered one, stick-on-stick, the umpire's whistle, sideline shouting, the specific hush before a PC injection. Audio is the cheapest immersion per hour of work in this entire project, and it is routinely deferred until it is too late to do well. Budget it into Phase 5, not Phase 9.

### 10.6 Where this is written down

ADR-012: art direction and pipeline (Blender-to-sprite, layer separation, atmosphere approach). ADR-013: presentation and camera language. Both belong in Phase 0 — they constrain Phase 5's architecture, and retrofitting interpolation and camera systems into a renderer built without them is a rewrite.

---

## 11. Open questions for Jan

**Resolved:** title is BULLY OFF · Belgian pyramid, two tiers · men's *and* women's as parameter profiles (§5.0) · float64 with §4.4 guardrails · server-authoritative multiplayer if ever · 20 Hz tick with mandatory CCD · calibration against Belgian League + FIH Pro League · play-offs in scope, built first · dual validation: statistical (§6) *and* situational (§6.2) · 2.5D rendered-from-3D pipeline (§10).

1. **Who sits on the situational review panel (§6.2)?** Three or four coaches who will not be polite. This is the project's highest-leverage recruitment and it costs nothing but asking. Line them up before Phase 3, because the scenario fixtures are built there.
2. **Which competition profile do you calibrate first?** Both ship; this is sequencing. Take the one you can sanity-check fastest from your own coaching experience.
3. **Does arcade mode really come after v1.0?** It is the more fun thing to build and the less valuable thing to ship. Guard the order deliberately.
4. **Confirm the current Belgian play-off format** when transcribing calibration data — bracket size, single or two-legged ties, and how play-downs interact with the second tier. A lookup, not a design decision, but Phase 6 needs it.
5. **Who does the Blender work (§10.3)?** One rigged player and one goalkeeper, animated, is the whole character budget. Doing it yourself, commissioning it, or buying and retargeting a rigged base mesh are all viable — but it is the one task in this project with no software-engineering escape hatch.

---

## 12. What success looks like

Not downloads. The bar is this: **a hockey coach plays a season and says "yes, that is what the sport is like."**

Everything in this brief — the determinism, the event log, the calibration harness, the circle-warped value grid — exists to make that sentence possible.
