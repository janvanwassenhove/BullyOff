# ADR-003 — PixiJS as renderer

**Status:** Accepted · 2026-08-18
**Decides:** the technology in `packages/render`.

## Context

The renderer consumes `MatchEvent[]` (ADR-002) and draws a top-down 2.5D pitch at 60 fps on a mid-range phone, with interpolation between 20 Hz ticks, dynamic camera, tinted sprites, weather/lighting atmosphere and particle effects (ADR-012/013). It must live inside a Vue 3 app but own its own canvas and loop.

## Options considered

### A. Phaser 3/4
- **For:** batteries-included game framework; scenes, input, tweens, arcade physics, sprite sheets, camera with follow/zoom out of the box.
- **Against:** it *wants* to own the game loop, state and physics — all of which live in the engine here. Fighting a framework's opinions is worse than having none. Heavier bundle. Its physics and scene lifecycle are dead weight for a replay viewer.

### B. three.js (+ Rapier for physics)
- **For:** real 3D; if we ever want camera angles, this is the door. Excellent ecosystem.
- **Against:** the brief explicitly rules out broadcast 3D (BRIEF §10.1). Rapier is redundant — physics is in the engine and must be deterministic; a second physics engine in the renderer is a lie waiting to diverge. 3D asset pipeline is the artist-team path ADR-001 rejected. Overkill that costs velocity every day.

### C. Raw Canvas 2D / WebGL by hand
- **For:** zero dependencies, total control.
- **Against:** sprite batching, texture atlases, tinting, filters, particle systems, DPI handling — all reinvented. Solo dev; no.

### D. PixiJS 8
- **For:** a 2D *rendering* library, not a game framework: it draws what it's told and gets out of the way, which is exactly the relationship a log-driven viewer needs. WebGL/WebGPU with automatic fallback, batched sprites, runtime tinting (club colours), filters/shaders (wet turf sheen, lighting), particle containers (rain, spray), text, and a mature Vue integration story. Bundle is reasonable and tree-shakeable. Rendered-from-Blender sprite sheets (ADR-012) are its native food.
- **Against:** no camera abstraction (we write one — ADR-013 wants a bespoke one anyway); no built-in tween/easing (small, we write what we need); v8 API churn from v7 means older examples mislead.

## Decision

**PixiJS 8.** `packages/render` exposes a `MatchView` that takes a canvas and an event log and owns the render loop; the Vue app mounts it and drives play/pause/speed/seek. Pixi never appears in `packages/engine`, `rules`, `shared`, or `worldgen` (lint-enforced).

## Consequences

- We write: interpolation layer, camera, tween helpers, an atlas loader. All small; all ours.
- The renderer is replaceable: it depends only on the event log. If three.js is ever wanted for a "3D replay" mode, it is a second consumer of the same log, not a rewrite (this is what ADR-002 buys us).
- Arcade mode (v1.x) reuses this renderer unchanged; only input handling is new.
- Phase 5 gate: 60 fps at 1×–8× on a mid-range phone. If Pixi cannot deliver that with reasonable care, revisit — but the more likely culprit is our draw call count, not the library.
