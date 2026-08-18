# ADR-013 — Presentation and camera language: interpolation, dynamic framing, moment budget, audio

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF §10.2, §10.4, §10.5. Constrains Phase 5; retrofitting interpolation and a camera system into a renderer built without them is a rewrite.

## Context

The engine ticks at 20 Hz (ADR-002); the screen refreshes at 60–120 Hz. Drawn raw, players would visibly step five times a second — the single cheapest way to make expensive art look cheap. Conversely, smooth motion, a camera that *tells the story*, and a handful of over-invested moments are what make small-scale games (FM's match engine, *Mini Motorways*) swallow people. And audio is the highest immersion-per-hour item in the whole project, routinely deferred until it's too late.

The renderer reads only the event log (ADR-002) and must support 1×–8× playback with scrub/seek (Phase 5 gate), so all of this must be built on *data*, not on a live simulation hook.

## Options considered

### Motion
- **Draw tick positions as-is** — rejected: 20 Hz stepping is visible and reads as cheap.
- **Extrapolate forward from last tick** — smooth until direction changes, then it overshoots and snaps; hockey is full of direction changes. Rejected for playback (fine for a future live-arcade prediction layer).
- **Interpolate between the last two known ticks with a fixed 1-tick render latency (50 ms)** — always smooth, never overshoots, and the "latency" is invisible in a replay viewer. **Chosen.** Position: linear/hermite between ticks using logged velocities; heading: shortest-arc angular lerp with easing; stick: interpolated orientation with a swing-through curve on strike events; ball: interpolate `x,y,z`, shadow offset from `z`.

### Camera
- **Fixed full-pitch overhead** — "a spreadsheet with grass". Rejected as the default; kept as a selectable *tactical* view (and it's the natural view for the coaching UI overlays).
- **Hard follow the ball** — nauseating at 8×; loses context. Rejected.
- **Director camera: dynamic framing driven by log-derived cues** — **chosen.** Rules, all cheap:
  - Frame the *play*, not the ball: a soft-bounded box containing ball + nearby players, smoothed with a critically-damped spring so it never jitters.
  - **Zoom tightens as play enters the 23 m area and again inside the circle; pulls back on a turnover** or long ball. Zoom is a smoothed function of ball position and velocity, not a hard switch.
  - **Lead** the ball by a fraction of its velocity so the camera anticipates.
  - **Punch** — a brief, small zoom-in on `Shot`/`Hit`/`DragFlick` events; a subtle shake on post/backboard impacts.
  - Camera decisions are pure functions of the event log window (past + one tick ahead), so they scrub and replay identically.
- Playback speed scales the camera's *responsiveness* too — at 8× the camera stays wider and calmer.

### Moments (BRIEF §10.4)
Four moments get a disproportionate budget; each is a **scripted presentation sequence** triggered by an event, replayable, and skippable:
- **Goal:** slow-motion hold (~1.5 s at 0.25×) starting a few ticks before the line crossing, camera punch on the strike, net-ripple animation, crowd swell, a beat of silence, *then* the scoreboard updates.
- **Penalty corner:** on `PenaltyCornerAwarded`, play pauses, camera tightens on the top of the circle at a fixed "PC" framing, tempo changes (subtle vignette, hush), the injection is the beat that releases it.
- **Shoot-out:** one attacker, one keeper, 8-second clock overlaid, camera on a tight two-shot from behind the attacker's shoulder — the one place we break "top-down" with a lower, more oblique 2.5D framing (still sprites, still no 3D).
- **Final whistle** of a season-defining match: freeze, crowd audio swell, no UI for a beat, then the result.

### Audio
- **Defer to Phase 9** — rejected explicitly. Audio ships in **Phase 5** with the renderer.
- **Web Audio API, small pooled one-shots + a few loops**, event-driven from the same log the renderer reads (so audio scrubs and syncs for free): stick-on-ball (dry crack / wet slap by surface state), stick-on-stick, ball-on-backboard, whistle (per event type), keeper pads, sideline shouts as a sparse ambient bed, crowd bed with intensity from circle-pressure and score/time, and the *specific hush* before a PC injection. Language-neutral in v1.0 (ADR-009). Ducking rules: SFX over ambience, hush over everything.
- Sound is muted until user gesture (browser policy) and respects a settings toggle; never blocks playback.

## Decision

`packages/render` is built, from its first commit in Phase 5, around:
1. an **interpolation buffer** between logged ticks (1-tick render latency, hermite/lerp, angular easing);
2. a **director camera** whose state is a pure function of a window of the event log, with spring smoothing, circle-aware zoom, velocity lead, and event punches; plus a selectable fixed tactical view;
3. a **moment system** — scripted, event-triggered, replayable presentation sequences for goal, PC, shoot-out, final whistle;
4. an **event-driven audio layer** shipped in the same phase, surface-aware.

Speed control 1×–8×, scrub and seek are first-class inputs to all four; nothing here reads engine state or wall-clock (renderer uses `requestAnimationFrame` deltas for its own smoothing only, never for simulation).

## Consequences

- Phase 5's gate — smooth at every speed, 60 fps on a mid-range phone, "a goal *feels* like a goal" — is testable: stepping is visible or it isn't; the moment sequences exist or they don't.
- The camera and moments are *code*, so they cost engineering time, not art time — the right trade for this team.
- Coaching overlays (Phase 7: rotation bar, live stats, PC designer) sit on top of the tactical view and must not fight the director camera — the two are separate view modes (BRIEF Phase 7 lists three).
- Cost: a real audio asset list (recorded or licensed SFX; a Phase 5 task with a budget line) and interpolation subtleties around discontinuities (restarts, substitutions, teleports on scrub) that need explicit handling: on a seek, the buffer is re-primed, never interpolated across.
