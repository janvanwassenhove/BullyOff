# ADR-008 — State management and worker boundary

**Status:** Accepted · 2026-08-18
**Decides:** where state lives in the browser apps and how the engine thread talks to the UI thread.

## Context

Three kinds of state exist in the manager app:
1. **Match simulation state** — owned by the engine, opaque (ADR-002), advanced by `tick()`; CPU-heavy in bursts (a full match at 8× is 84,000 ticks in ~9 minutes of wall time; a batch of season fixtures is millions).
2. **Career/world state** — clubs, players, tables, history; large, mutated between matches, persisted (ADR-007).
3. **UI state** — current screen, selections, view mode, playback position, speed.

Running the engine on the main thread would jank the UI on every simulation burst, and mobile browsers throttle long main-thread tasks. So the engine runs in a **Web Worker** (BRIEF §4.2). The question is what crosses that boundary and how the UI holds what it needs.

## Options considered

### UI/world state
- **Vuex** — legacy; Pinia is its successor. Rejected.
- **Plain composables + `reactive()`** — light, but the career state is large and long-lived and benefits from named stores, devtools, and a clear persistence hook. Fine for tiny things; not as the pattern.
- **Pinia stores** — first-party, typed, devtools, `$subscribe` for persistence triggers, works with `<script setup>`. **Chosen** (BRIEF §4.1 already names it).

### Worker boundary
- **Engine on main thread** — rejected: jank, throttling, and it makes it easy to cheat ADR-002 by peeking at state.
- **`postMessage` with structured clone of `MatchEvent[]` batches** — simple, portable, cheap enough: events are small POJOs; batching per N ticks amortises the clone. **Chosen.**
- **`SharedArrayBuffer` + Atomics** — fastest, but requires cross-origin isolation headers (COOP/COEP) which complicate static hosting and break some embeds; and it invites shared-mutable-state thinking that ADR-002 forbids. Not for v1.0; revisit only if profiling shows `postMessage` cost matters.
- **Comlink or similar RPC wrapper** — nice ergonomics, one more dependency in the hot path; a hand-written typed message protocol is ~100 lines and fully under our control. Skip; write our own.

### Batch simulation (season fixtures the coach doesn't watch)
- Same worker, different command: `simulateMatch(seed, setup) → { summary, log? }`. Optionally a small worker pool later. The engine code path is identical to the watched match — that identity is the whole point of ADR-002.

## Decision

- **Pinia** for career/world state and UI state. Stores are the *only* place UI components read shared state from. Match simulation state is **never** in Pinia — Pinia holds the *event log received so far*, playback position, and derived stats, not engine internals.
- **One Web Worker** hosts the engine. A hand-written, fully typed message protocol in `packages/engine/src/worker/` (Phase 1):
  - UI → worker: `init(seed, setup, profile)`, `advance(ticks)`, `command(tickStampedInput)`, `simulateMatch(...)` (batch), `terminate()`.
  - worker → UI: `events(batch: MatchEvent[], fromTick, toTick)`, `done(summary)`, `error(...)`.
  - All messages are plain serialisable objects (structured clone); no functions, no class instances, no `Map`/`Set` (ordering, ADR-002).
- **The engine module itself has no knowledge of workers.** `packages/engine/src/worker/host.ts` is a thin adapter around the pure `tick()`; the same engine runs in Node for `simcli` with no adapter at all. Vite's `?worker` import wires it in the app (`worker.format = 'es'` set in Phase 0).
- **Renderer** (`packages/render`) is fed by the same event stream the Pinia store receives; it keeps its own interpolation buffer (ADR-013) and does not read Pinia.

## Consequences

- Determinism is protected structurally: the UI *cannot* reach engine state across a `postMessage` boundary.
- Playback and live simulation are the same code path: the worker produces events, the store/renderer consume them; "watching live" just means the consumer is only slightly behind the producer.
- Testing: the protocol adapter is unit-tested with a fake `postMessage`; the engine is tested with no worker at all.
- Cost: structured-clone overhead per batch (measure in Phase 1; expected negligible), and a small typed protocol to maintain. If arcade mode (v1.x) needs sub-frame input latency, revisit batching granularity — not the architecture.
