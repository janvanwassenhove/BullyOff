repo: janvanwassenhove/BullyOff
branch: main
path: apps/manager

## Last sync

date: 2026-08-21T16:37:00Z

### Updated in this project

- Recreated the current manager UI (season, club pick, touchline, viewer, about, onboarding) from source.
- Palette, spacing and type lifted verbatim from `styles/tokens.css`.
- Copy taken from `i18n/en.json`; club/player names follow `worldgen` morphology.

## Screen map

| Project screen | Repo files |
| --- | --- |
| Shell / nav / viewer layout | apps/manager/src/App.vue, src/styles/tokens.css, src/styles/base.css, index.html |
| Season · new career | apps/manager/src/components/SeasonView.vue, src/i18n/en.json |
| Pick your club | apps/manager/src/components/SeasonView.vue, packages/worldgen/src/clubs.ts |
| Season hub (table/squad/fixtures/history) | apps/manager/src/components/SeasonView.vue |
| The touchline | apps/manager/src/components/CoachView.vue |
| Match viewer | apps/manager/src/components/MatchViewer.vue |
| About & privacy | apps/manager/src/components/AboutView.vue |
| Onboarding | apps/manager/src/components/Onboarding.vue |
