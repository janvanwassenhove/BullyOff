# ADR-011 — Multiplayer posture: server-authoritative, never P2P lockstep

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF §4.5. Multiplayer itself is **out of scope for v1.0**; this ADR fixes the door we leave open so that other decisions (ADR-005 especially) can be made now.

## Context

Multiplayer might never ship. But the *shape* of a possible multiplayer mode determines whether the engine needs bit-identical cross-machine floating point today (which would push us to fixed-point, ADR-005 option A) or not. Deciding the network model now is what lets us choose float64 with a clear conscience.

Two plausible multiplayer products exist for this game:
1. **Async manager league** — several human coaches in one fictional league; fixtures are simulated once and results/replays distributed.
2. **Live arcade** — two humans controlling players in real time (v1.x arcade mode, networked).

## Options considered

### A. Peer-to-peer lockstep (every client simulates; only inputs are exchanged)
- **For:** minimal bandwidth; no server cost; the classic RTS answer.
- **Against:** requires **bit-identical simulation on every peer** — every browser, every OS, every JIT — forever. That is the one thing JavaScript float64 cannot guarantee (ADR-005), and fixing it means fixed-point or WASM-with-strict-FP across the entire engine. Input latency is bound to the slowest peer; one disconnect stalls everyone; cheating is trivial (clients own truth). Wrong for a browser game with a solo maintainer.

### B. Server-authoritative simulation (server runs the engine; clients send inputs and receive events/state)
- **For:** one machine simulates, so cross-machine determinism is **not required** — clients render the same event log because it *is* the same log (ADR-002). Anti-cheat by construction. Reconnect is trivial: resend the log. The event-log contract fits this exactly. For the async league it collapses to "simulate once, distribute the log", which needs no real-time infrastructure at all.
- **Against:** a server exists — cost, ops, a privacy notice, and a departure from v1.0's static-site posture. Live arcade over server-authoritative needs client-side prediction/interpolation to hide RTT — well-understood, but real work.

### C. Hybrid — lockstep for arcade, server for league
- Rejected: any lockstep at all drags the whole engine into the fixed-point requirement.

## Decision

**Server-authoritative if multiplayer ever ships. Never P2P lockstep.**

- The async manager league is the presumed first multiplayer product: the server (presumed **Supabase** — edge function runs the same `@bullyoff/engine` in Node/Deno; Postgres holds league state; storage holds logs) simulates each fixture once and distributes `MatchEvent[]`. Clients replay. No real-time requirement.
- Live networked arcade, if ever, is server-simulated with client-side prediction. Out of scope even for v1.x planning beyond this sentence.
- Consequences already locked in by this decision: ADR-005 may use float64; ADR-002's tick-stamped serialisable inputs are exactly the wire format such a server would consume; ADR-008's worker protocol is a local rehearsal of the same message shapes.

## Consequences

- **v1.0 remains a static site with no backend.** Nothing in this ADR is built now.
- If multiplayer is started: a new ADR for the server platform, an updated privacy notice (accounts, pseudonymous IDs — ADR-006), and a cost model. Not a config flag.
- **Reversal condition:** if a P2P lockstep mode is ever seriously proposed, ADR-005 must be superseded first (fixed-point or WASM strict FP), and the determinism harness must be extended to prove cross-machine bit-identity. That cost is why the answer is "never".
