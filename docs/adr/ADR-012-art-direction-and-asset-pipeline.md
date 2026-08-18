# ADR-012 — Art direction and asset pipeline

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF §10.1–10.3. Constrains Phase 5's renderer architecture; retrofitting layer separation or tinting into a renderer built without them is a rewrite.

## Context

The bar is "stunning — the player must be pulled in". Photoreal 3D is out (ADR-001, ADR-003): no artist team, no budget, and it would take the project off the web. So "stunning" must be reached through **coherence, motion, atmosphere and moment**, at a top-down 2.5D scale where nobody sees a face. The solo dev prefers building systems to pushing pixels, and there is exactly one character-art task with no engineering escape hatch (BRIEF open question 5).

Assets needed: a pitch (turf, lines, circles, goals, dugouts, sideline furniture), players (outfield + goalkeeper) in enough poses/directions to read as hockey, sticks, ball, weather/lighting layers, UI iconography.

## Options considered

### A. Hand-drawn pixel art / vector sprites, per pose per direction
- **For:** charming; small files; the indie default.
- **Against:** every animation is a redraw ×8 directions; consistency of lighting and anatomy depends on a skill the project does not have; adding a "drag flick" pose later is days of art. Does not scale for a solo engineer.

### B. Real-time 3D characters in the browser (three.js) drawn from above
- **For:** infinite angles and animations for free once rigged.
- **Against:** rejected in ADR-003; the perf budget on mid-range phones for 22 skinned meshes plus effects is tight; the presentation ceiling ("mediocre 3D") is *worse* than good 2.5D.

### C. Model once in Blender, batch-render top-down sprite sheets; palette-swap kits at runtime
- **For:** one rigged player + one goalkeeper is the whole character budget. Consistent lighting, correct shadows and proper anatomy come from the render, not the artist's hand. A new animation is a render job, not a redraw. Directions/angles are a loop. Leaves a genuine 3D path open later because the source assets exist. Rendered sprites are exactly what PixiJS batches best (ADR-003).
- **Against:** someone must do the Blender work (open question 5 — DIY, commission, or retarget a purchased rigged base). Sprite sheets are bigger than vectors (mitigated by texture atlases, WebP/AVIF, and few angles). Rendered sprites at small scale can look "muddy" if not art-directed — needs a deliberate style pass (outline, value contrast).

## Decision

**Option C — Blender-to-sprite**, with these binding constraints on the renderer:

1. **Layer separation.** Body, stick, shadow and ball are *separate* sprites composed at runtime. Body sprites are rendered *without* stick; the stick is its own sprite rotated in code from engine stick orientation. Shadows are separate so they can be offset by ball height (ADR-004) and by time-of-day light direction.
2. **Runtime tinting for kits.** Body sprites are rendered in a **neutral palette with a mask** (e.g. base greyscale + a "kit" channel or two-tone alpha regions) so club colours are applied via Pixi tint/filter — no per-club sprite sheets. Skin/hair variation is a small fixed set of tints. Goalkeeper kit is a distinct silhouette (pads, helmet).
3. **Directions and poses.** 8 (possibly 16) yaw directions; poses: idle, walk, run, sprint, dribble, push, hit, drag-flick, tackle, fallen, celebrate; goalkeeper: stance, save left/right, dive, kick. Rendered at 2 scales (1×, 2× for high-DPI). Exact list finalised in Phase 5 from what the event log actually distinguishes — **do not render poses the engine cannot signal**.
4. **Pitch is procedural, not a bitmap.** Turf as a tiled texture (with subtle variation), lines/circles/goals **vector-drawn from the same metre coordinates the engine uses**, so pitch geometry is exact and resolution-independent. Wet/watered state is a shader/tint pass (specular sheen, darker saturation, spray particles) over the same tiles.
5. **Atmosphere is shader/particle work, not art**: time-of-day light direction and colour temperature (drives shadow angle and length), rain, spray off a watered pitch, floodlight bloom, cold-breath particles, sideline crowd as low-detail silhouettes/particles. All in Pixi filters/containers.
6. **Palette and type.** Anchored on the blue/green of a watered water-based turf and the off-white ball; card colours are FIH-standard green/yellow/red. Design tokens live in `apps/manager/src/styles/tokens.css` (started in Phase 0). One display face for the wordmark, system UI font for everything else — no webfont weight in the perf budget.
7. **Asset pipeline.** `assets-src/` (Blender files, not shipped) → render script → `packages/render/assets/` (atlas JSON + WebP, shipped). Deterministic, re-runnable, documented in `docs/art/pipeline.md` (Phase 5).

## Consequences

- Phase 5's renderer is designed around composed sprites + tint + procedural pitch from day one.
- **Open question 5 becomes a hard dependency of Phase 5**: the rigged models must exist before the pose list can be rendered. Placeholder capsule sprites unblock engineering until then — the composition/tint architecture is identical.
- We accept larger asset payloads than vector art (budget: < 4 MB for all sprite atlases at 1×). Measured in Phase 5.
- What we explicitly do not build: faces, cloth sim, per-club bespoke art, 3D camera angles.
