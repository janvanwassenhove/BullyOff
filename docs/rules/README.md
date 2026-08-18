# docs/rules

Hockey ruleset spec and calibration targets. Populated in later phases:

| File | Phase | Contents |
|---|---|---|
| [`ruleset.md`](ruleset.md) | 2 ✓ | The FIH outdoor rules as the engine implements them, one row per law, with the positive/negative tests that cover it and the provisional readings listed for Jan. |
| `calibration-data.md` | 4 | Transcribed aggregate statistics from the Belgian League and FIH Pro League, **men's and women's separately**, with source, season and sample size per row. Aggregates only — no individual player data (ADR-006). |
| `calibration.md` | 4 | Targets vs. achieved values per profile (`mens`, `womens`), tolerance bands, known deviations. Publishing this is the Phase 4 gate. |
| `situational-review.md` | 5 | Coach panel verdicts per scenario fixture: seed, verdict, fix. A rejected scenario blocks the gate (ADR-010). |
