# ADR-006 — Fictional-only world, GDPR posture

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF constraint C3, §7.

## Context

Football management games ship real players under licence. Field hockey is different in a way that is legal, not commercial: club hockey is semi-amateur, squads are full of 15–19-year-olds, and there is no licensing body that could grant a right to profile them. Assigning attribute ratings to a real, named minor and distributing that commercially is processing of personal data concerning a child under GDPR. There is no consent mechanism that scales to it and no legitimate-interest argument that survives contact with a DPA. This is a wall, not a negotiation.

Separately, real club names and crests are trademarks and identity; using them uninvited invites both legal friction and the expectation that the *players* are real too.

## Options considered

### A. Real leagues, real players (licensed or scraped)
- Rejected outright for the reasons above. Not a trade-off; a prohibition.

### B. Real clubs, fictional players
- **For:** local flavour; a Belgian coach recognises the league.
- **Against:** the moment a real club appears with a fictional squad, players and parents will map fictional ratings onto real people ("that's obviously Lotte"). Half the legal exposure, most of the harm. Also trademark exposure. Rejected.

### C. Fully fictional world: generated clubs, generated persons, generated history
- **For:** zero personal data; zero licensing; the design that Basketball GM and OOTP prove can carry emotional weight; unlimited replayability via seeds; and — the convenient truth — the coaching/rotation/development loop the brief identifies as the real hook is entirely name-independent.
- **Against:** no instant recognition; onboarding must sell the world in the first ten minutes. Name generation must be good enough not to feel like Lorem Ipsum with sticks.

### D. C, plus a local-only "Club mode" (v1.x) where a coach enters their own squad
- As C, with a strictly bounded escape hatch: data written to local storage only, never transmitted, never in default exports, with an explicit UI warning. That makes it a coaching tool operating under the *club's* own lawful basis for processing its members' data, not ours.

## Decision

**Option D.** Shipped builds contain only generated fictional persons and clubs. Club mode is v1.x and local-only.

Rules, enforced in code where possible:
- `packages/worldgen` maintains a **blocklist of real club names** (Belgian, Dutch, German, and major international clubs at minimum) and rejects any generated club name that collides — normalised, case- and diacritic-insensitive. A test asserts the blocklist is applied.
- Name pools are weighted by nationality; separate first-name pools per gender (BRIEF §5.0), shared surname pools per nationality. Generated full names are checked against **nothing** and claim **nothing** — no "famous person" filter, because maintaining one would itself be a list of real people.
- No accounts, telemetry, analytics or ads in v1. Any change to that is a new ADR *and* a privacy notice, never a config flag.
- Club mode data (v1.x): `localStorage`/IndexedDB only; excluded from share/export by default; UI warning on entry.

## Consequences

- Phase 8 (worldgen) owns the blocklist and name pools; Phase 9 owns the privacy statement in the app.
- The world must earn attachment through history texture (BRIEF Phase 8 gate) — a design burden we accept.
- If a future multiplayer mode (ADR-011) ever stores anything server-side, it stores *fictional* game state and a pseudonymous account. Real squads never leave the device.
