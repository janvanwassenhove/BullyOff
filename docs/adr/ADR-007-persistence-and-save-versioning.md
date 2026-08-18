# ADR-007 — Persistence format and save-versioning strategy

**Status:** Accepted · 2026-08-18
**Decides:** how saves, replays and settings are stored, and how they survive engine changes.

## Context

A manager career spans many seasons and many hours. It must survive app updates, browser cache pressure, and being moved between devices by the player (export/import — v1.0 has no server, ADR-001). Match replays are event logs (ADR-002) and can be large-ish. Everything runs client-side in a browser (ADR-001), where the storage options are `localStorage` (5 MB, synchronous, string-only), IndexedDB (large, async, structured), OPFS (newer, file-like), and "download a file".

Two very different things need storing:
1. **Career save** — world state: clubs, players, tables, history, coach progress. Tens of thousands of entities. Written at natural checkpoints (after each match, at season roll-over). Must be *migratable* across schema changes.
2. **Replays** — `MatchEvent[]` logs. Written once, read many. Sharable. Should be *stable* rather than migratable: an old log should still play back in a new renderer.

## Options considered

### Storage backend
- **`localStorage` only** — simple, but 5 MB is too small for a career plus even a handful of replays, and synchronous JSON of a large save janks the UI. Rejected as the primary store.
- **IndexedDB** — large quota, async, structured clone (no stringify tax on the way in). Well supported everywhere including iOS Safari (with the caveat that Safari may evict storage under pressure — mitigated by `navigator.storage.persist()` and by making export easy). **Chosen** as the primary store.
- **OPFS** — attractive but support on iOS is recent and uneven. Not for v1.0.
- **File download/upload** — the export/import and share path. Always available. **Chosen** as the portability path.

### Wire format
- **JSON** — human-readable, debuggable, trivially diffable, structured-clone-compatible. Verbose. **Chosen**, with `JSON` for saves and a compact JSON shape for replays (arrays not objects per event where it matters), gzip via `CompressionStream` on export.
- **Binary (MessagePack / custom)** — smaller, faster, opaque. Premature: we don't have a size problem yet, and debuggability during Phases 1–8 is worth far more than bytes. Revisit only if a measured replay exceeds budget (ADR-002: < 2 MB uncompressed per match).

### Versioning
- **No versioning, wipe on breaking change** — unacceptable for a career game.
- **Schema version + linear migration chain** — every save carries `{ format: 'bullyoff-save', version: N }`; the app holds migrations `N → N+1`; on load, run the chain. Same pattern as database migrations. Boring, proven. **Chosen.**
- **Tolerant readers everywhere** — every reader handles every historical shape. Unbounded complexity; rejected.

## Decision

- **Primary store: IndexedDB** via a small typed wrapper in `apps/manager` (Phase 6). Object stores: `saves`, `replays`, `settings`. Request `navigator.storage.persist()` on first save.
- **Format: JSON**, structured-cloned into IndexedDB; gzip on export/import (`CompressionStream`, fallback to plain JSON where unsupported).
- **Every persisted document carries a header:** `{ format: 'bullyoff-save' | 'bullyoff-replay' | 'bullyoff-settings', version: <int>, engineVersion: <semver>, profile: 'mens' | 'womens', createdAt: <ISO string, app-side only — never inside the engine> }`.
- **Saves are migrated** by a linear chain of pure functions `migrate_vN_to_vN+1(doc)`. Migrations are tested with fixture documents from each historical version. A save newer than the app refuses to load with a clear message, never silently.
- **Replays are versioned but not migrated.** The event schema is *append-only*: new event types and new optional fields may be added; existing fields are never renamed or re-typed. A renderer must ignore unknown event types. Breaking the event schema is a major engine version and old replays are marked "legacy — playback may differ" rather than migrated. This keeps ADR-002's contract honest.
- **Seeds are not saves.** A replay is stored as its *log*, not as `seed + inputs`, because engine tuning between versions would otherwise change what the player "saved". (Seed + inputs are still stored alongside for bug reports.)

## Consequences

- Phase 6 builds the IndexedDB layer and migration runner; Phase 1 fixes the event-log header shape so replays written by `simcli` in Phase 4 are already valid documents.
- Save size is a metric to watch from Phase 6; if a 20-season career exceeds ~20 MB, revisit format before Phase 9.
- Export/import gives players ownership of their data with no server (ADR-001, ADR-006).
- Costs: migration discipline for every save-shape change; a versioning header that must be respected by every writer. Cheap compared with a lost career.
