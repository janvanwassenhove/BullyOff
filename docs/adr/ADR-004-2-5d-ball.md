# ADR-004 — 2.5D ball model

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF §5.2, §5.2.1.

## Context

Hockey is nominally a ground game, but the ball leaves the turf constantly and *legality depends on height*: a raised ball into a crowd is dangerous play; a ball above shoulder height may not be played (with exceptions); a drag flick at a penalty corner rises to head height at 100+ km/h; aerials/scoops travel 40 m through the air; deflections lift; a shot at goal must be judged against a 2.14 m crossbar. Roughly a third of goals come from penalty corners where the ball's height at the moment it passes the first runner decides both danger and outcome.

Separately, at a fixed 20 Hz tick (BRIEF §4.3) a fast ball moves 1.4–1.8 m per tick — further than a goal is deep — so naive point sampling tunnels.

## Options considered

### A. Pure 2D ball (x, y), height faked as a visual "air" flag
- **For:** simplest physics; every football-sim does this.
- **Against:** cannot express dangerous play, above-shoulder rule, crossbar, drag-flick trajectory, aerials, keeper high/low saves. Every one of those becomes a scripted special case with a random roll — the exact "football with different rules" failure the brief exists to avoid.

### B. Full 3D rigid body with spin, Magnus effect, bounce restitution per axis
- **For:** maximally faithful.
- **Against:** hockey balls are small, heavy, dimpled and low-spin; Magnus effect on a hockey ball is second-order at match speeds. Full spin dynamics add tuning surface without changing outcomes a coach would notice. Diminishing returns, real cost.

### C. 2.5D: (x, y, z) position + velocity, gravity, ground bounce with restitution, rolling friction as a function of surface state, a scalar spin term reserved for later
- **For:** captures everything rules and outcomes need — height for legality, trajectory for flicks/aerials/deflections, bounce for rebounds — at the cost of one extra coordinate. Ground contact is a simple z ≤ 0 test. Air drag is a single coefficient. Surface state (dry/watered/wet) is a friction/restitution parameter set, which gives the pre-match watering decision genuine mechanical teeth.
- **Against:** must handle the air/ground transition carefully (a rolling ball and a bouncing ball have different friction regimes). Slightly more collision maths (segment vs. crossbar plane, not just goal line).

## Decision

**Option C, with continuous collision detection.** Ball state is `{ x, y, z, vx, vy, vz, spin }` in SI units. Each tick's motion is a **swept segment** tested against goal plane, posts, crossbar, backboard, sideboards and player/stick capsules; resolved at earliest time of impact, remainder of tick continued with post-collision velocity, up to a cap of 4 resolutions per tick (an event is logged if the cap is hit — that is a bug signal). Circle entry, goal-line crossing, 23 m lines and sidelines are all detected on the swept path.

Only the ball is swept; players and sticks move discretely — they never approach tunnelling speeds at 20 Hz.

## Consequences

- Rules layer (Phase 2) can express dangerous play, above-shoulder, and crossbar honestly, as predicates on ball height and velocity — no dice.
- Surface state is a first-class parameter of ball physics: `friction`, `restitution`, `airDrag` per `{dry, watered, wet}`; tuned in Phase 4 per profile.
- Renderer derives the shadow offset from `z` (ADR-013) — free visual payoff.
- Phase 1 acceptance test (BRIEF §5.2.1): a 130 km/h shot from 14 m registers a goal at every tested angle; a shot at the post rebounds; a rolled ball on a known surface stops within tolerance of the analytic answer.
- Spin is a reserved scalar today. If Phase 4 calibration shows drag-flick or aerial trajectories cannot be matched without Magnus lift, a superseding ADR adds it — with a test that shows the deviation first.
