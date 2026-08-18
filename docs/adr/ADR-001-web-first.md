# ADR-001 — Web-first over Unity / native

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF constraint C4.

## Context

BULLY OFF is a solo project by a coach-engineer, aimed at a niche, structurally under-served audience: hockey clubs, coaches, parents, youth players. Distribution matters more than fidelity — a coach must be able to open a link on a phone in the clubhouse and be playing. There is no marketing budget, no store presence, and no artist team.

The engine is a headless TypeScript simulation regardless of platform (ADR-002). The question is only what wraps it.

## Options considered

### A. Unity (C#) — desktop/mobile native, Steam + app stores
- **For:** best-in-class tooling for 3D and animation; genuine "stunning" broadcast presentation is reachable; store discovery.
- **Against:** the engine would have to be written in C# or bridged, which forks the one asset that matters. Store review cycles, signing, per-platform builds. Unity's licence history is a live risk for a solo dev. Zero-friction sharing ("here, try this link") is gone. Every hour spent on cameras and shaders is an hour not spent on the simulation, and Unity makes that hour very tempting.

### B. Godot (GDScript / C#)
- **For:** open source, lighter than Unity, has an HTML5 export.
- **Against:** the HTML5 export is heavy (tens of MB, slow cold start on mobile), the web is a second-class target, and the engine would still not be TypeScript. Same fork-the-engine problem as A.

### C. Web-first: TypeScript everywhere, Vite, PixiJS, PWA
- **For:** one language from engine to UI; the engine literally *is* the code that ships; instant distribution by URL; PWA gives offline and installability; Web Workers give the headless engine a real thread; the same bundle wraps into Tauri/Capacitor later with no rewrite. Solo-dev velocity is highest here by a distance.
- **Against:** presentation ceiling is 2.5D (ADR-012 argues that's the right ceiling anyway). Browser performance variance on low-end Android. Float determinism across JS engines is a real, if narrow, concern (ADR-005). No store discovery — but the audience is reached through clubs, not stores.

## Decision

**Web-first (C).** The product runs in a mobile browser from a shared link. Desktop/native wrappers (Tauri, Capacitor) are optional later work that reuse the same codebase byte for byte.

## Consequences

- We accept a 2.5D presentation ceiling and commit to making it *coherent* rather than *photoreal* — see ADR-012/013.
- Performance budget: 60 fps replay on a mid-range phone is a Phase 5 gate. Failing it is a renderer problem to solve, not a reason to reverse this ADR.
- The engine must be safe to run in a Web Worker and in Node unchanged (ADR-002, ADR-008).
- Deployment is a static site (GitHub Pages behind Cloudflare). No backend in v1.0.

## Exit conditions (what would reverse this)

Reverse to a native engine only if **all** of the following become true: (1) a real audience exists and is asking for it, (2) mobile-browser performance for the *manager* loop — not arcade — cannot be made acceptable after honest optimisation, and (3) there is budget for an artist. Any one alone is not sufficient. Note that even then, the headless engine stays TypeScript and the switch is a renderer/host swap (ADR-002 makes that a bounded job).
