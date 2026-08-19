import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import type { MatchEvent, MatchLog } from '@bullyoff/engine';
import { decodeReplay, encodeReplay, type ReplayFile } from '@bullyoff/engine';
import { EngineClient } from '../engine/client';

/**
 * The current replay and how it was produced. Holds a MatchLog (events + frames)
 * — never engine state (ADR-008). Playback position lives in the viewer.
 */
interface MatchStoreState {
  log: MatchLog | null;
  source: string;
  busy: boolean;
  error: string;
  seed: number;
  profile: 'mens' | 'womens';
  surface: 'dry' | 'watered' | 'wet';
  scenarioId: string;
  /** Kit colours [home, away] for the viewer (null = defaults). */
  colours: [number, number] | null;
}

export const useMatchStore = defineStore('match', {
  state: (): MatchStoreState => ({
    log: null, source: '', busy: false, error: '', seed: 42, profile: 'mens', surface: 'watered', scenarioId: 'pc-dragFlick', colours: null,
  }),
  getters: {
    events: (s): MatchEvent[] => s.log?.events ?? [],
    score: (s): [number, number] => {
      const ft = s.log?.events.find((e) => e.t === 'FullTime');
      return ft?.t === 'FullTime' ? ft.score : [0, 0];
    },
  },
  actions: {
    async simulate(): Promise<void> {
      this.busy = true; this.error = '';
      try {
        const client = getClient();
        this.log = markRaw(await client.simulateAi(this.profile, this.surface, this.seed, 1));
        this.source = `AI match · ${this.profile}/${this.surface} · seed ${this.seed}`;
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; }
    },
    async runScenario(): Promise<void> {
      this.busy = true; this.error = '';
      try {
        this.log = markRaw(await getClient().scenario(this.scenarioId));
        this.source = `scenario · ${this.scenarioId}`;
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; }
    },
    loadJson(text: string, name: string): void {
      try {
        const obj = JSON.parse(text) as ReplayFile | MatchLog;
        this.log = markRaw('format' in obj ? decodeReplay(obj) : obj);
        this.source = `file · ${name}`; this.error = '';
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); }
    },
    exportReplay(): string | null {
      return this.log ? JSON.stringify(encodeReplay(this.log, 4)) : null;
    },
  },
});

let client: EngineClient | null = null;
function getClient(): EngineClient { client ??= new EngineClient(); return client; }
