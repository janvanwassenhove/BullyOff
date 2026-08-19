import { defineStore } from 'pinia';

/**
 * App-level shell store. Holds nothing game-related in Phase 0.
 * Match state never lives in Pinia: the engine owns it inside a Web Worker
 * and the UI receives MatchEvent[] batches only (ADR-008).
 */
export const useAppStore = defineStore('app', {
  state: () => ({
    phase: 5,
    phaseTitle: 'Renderer',
  }),
});
