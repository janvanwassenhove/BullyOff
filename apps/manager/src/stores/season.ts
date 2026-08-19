import { defineStore } from 'pinia';
import { markRaw, toRaw } from 'vue';
import { ENGINE_VERSION, type MatchLog, type MatchSetup, type TeamTactics } from '@bullyoff/engine';
import { deserialize, serialize, standings, fixturesToday, fixtureSetup, clubPlayers, ageOf, overall, type ClubId, type Fixture, type TableRow, type World, type SaveFile } from '@bullyoff/season';
import type { RegionFlavour } from '@bullyoff/worldgen';
import SeasonWorker from '../engine/season.worker?worker';
import type { FromSeason, ToSeason } from '../engine/season.worker';
import { loadSlot, saveSlot, listSlots, persistStorage } from '../engine/persist';
import { i18n } from '../i18n';
const tr = (key: string, params: Record<string, unknown> = {}): string => i18n.global.t(key, params);

/** A live coached match (Phase 7): everything the CoachView needs, all plain data. */
export interface Coaching {
  fixtureId: number;
  setup: MatchSetup;
  seed: number;
  tactics: [TeamTactics, TeamTactics];
  coachTeam: 0 | 1;
  colours: [number, number];
  /** Club short codes [home, away] and names. */
  shorts: [string, string];
  clubNames: [string, string];
  /** local engine player id → display name / role */
  names: Record<number, { name: string; role: string }>;
  title: string;
}

interface SeasonState {
  world: World | null;
  coaching: Coaching | null;
  busy: boolean;
  error: string;
  lastUserLog: MatchLog | null;
  /** Kit colours [home, away] of the last user match, for the viewer. */
  lastUserColours: [number, number] | null;
  lastPlayed: number[];
  slots: string[];
  message: string;
  /** Progress of the running worker request (0..1) or null. */
  progress: { done: number; total: number; label: string } | null;
}

let worker: Worker | null = null;
let nextId = 1;
let onProgress: ((p: { done: number; total: number; label: string }) => void) | null = null;
const pending = new Map<number, { resolve: (m: FromSeason) => void; reject: (e: Error) => void }>();
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
function ask(msg: DistributiveOmit<ToSeason, 'id'>): Promise<FromSeason> {
  worker ??= (() => { const w = new SeasonWorker(); w.onmessage = (ev: MessageEvent<FromSeason>) => { if (ev.data.type === 'progress') { onProgress?.(ev.data); return; } const p = pending.get(ev.data.id); if (!p) return; pending.delete(ev.data.id); if (ev.data.type === 'error') p.reject(new Error(ev.data.message)); else p.resolve(ev.data); }; return w; })();
  const id = nextId++;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker?.postMessage({ ...msg, id }); });
}

export const useSeasonStore = defineStore('season', {
  state: (): SeasonState => ({ world: null, coaching: null, busy: false, error: '', lastUserLog: null, lastUserColours: null, lastPlayed: [], slots: [], message: '', progress: null }),
  getters: {
    userClub: (s) => (s.world?.userClub ? s.world.clubs[s.world.userClub] ?? null : null),
    table(): TableRow[] { return this.world && this.userClub ? standings(this.world, this.userClub.tier) : []; },
    today(): Fixture[] { return this.world ? fixturesToday(this.world) : []; },
    nextUserFixture(): Fixture | null {
      if (!this.world?.userClub) return null;
      const u = this.world.userClub;
      return this.world.season.fixtures.filter((f) => !f.played && (f.home === u || f.away === u)).sort((a, b) => a.day - b.day)[0] ?? null;
    },
    squad(): { id: number; name: string; role: string; age: number; ovr: number; injured: number; goals: number }[] {
      const w = this.world;
      if (!w?.userClub) return [];
      const uc = w.userClub;
      return clubPlayers(w, uc, true).map((p) => ({ id: p.id, name: `${p.first} ${p.last}${p.youth ? ' (youth)' : ''}`, role: p.role, age: ageOf(p, w.year), ovr: Math.round(overall(p) * 10) / 10, injured: p.injuredDays, goals: p.goals }));
    },
    clubName(): (id: ClubId) => string { return (id) => this.world?.clubs[id]?.name ?? id; },
    /** The user's fixture on today's match day, if any (coachable). */
    todaysUserFixture(): Fixture | null {
      const w = this.world; if (!w?.userClub) return null;
      const u = w.userClub;
      return fixturesToday(w).find((f) => f.home === u || f.away === u) ?? null;
    },
  },
  actions: {
    async newWorld(seed: number, profile: 'mens' | 'womens', flavour: RegionFlavour = 'mixed', historyYears = 20): Promise<void> {
      this.busy = true; this.error = ''; this.message = historyYears > 0 ? tr('season.msgWriting', { n: historyYears }) : tr('season.msgGenerating');
      try {
        const r = await ask({ type: 'create', seed, profile, opts: { flavour, historyYears } });
        if (r.type === 'world') { this.world = r.world; this.lastUserLog = null; this.message = tr('season.msgNewWorld', { n: r.world.history.length }); }
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; }
    },
    pickClub(id: ClubId): void { if (this.world) this.world.userClub = id; },
    async playDay(): Promise<void> {
      if (!this.world) return;
      this.busy = true; this.error = '';
      try {
        const r = await ask({ type: 'day', world: toRaw(this.world), userClub: this.world.userClub });
        if (r.type === 'world') { this.world = r.world; if (r.userLog) { this.lastUserLog = markRaw(r.userLog); this.lastUserColours = this.coloursFor(r.playedFixtureIds); } this.lastPlayed = r.playedFixtureIds; this.message = tr('season.msgDayPlayed', { day: r.world.season.day, n: r.playedFixtureIds.length }); }
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; }
    },
    async playToEnd(): Promise<void> {
      if (!this.world) return;
      this.busy = true; this.error = '';
      onProgress = (p) => { this.progress = p; };
      try {
        const r = await ask({ type: 'toEnd', world: toRaw(this.world), userClub: this.world.userClub });
        if (r.type === 'world') { this.world = r.world; if (r.userLog) { this.lastUserLog = markRaw(r.userLog); this.lastUserColours = this.coloursFor(r.playedFixtureIds); } this.message = tr('season.msgSeasonFinished', { year: r.world.year }); }
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; this.progress = null; onProgress = null; }
    },
    async nextSeason(): Promise<void> {
      if (!this.world?.season.finished) return;
      this.busy = true;
      try { const r = await ask({ type: 'newSeason', world: toRaw(this.world) }); if (r.type === 'world') { this.world = r.world; this.message = tr('season.msgNewSeason', { year: r.world.year }); } }
      catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; }
    },
    /** Phase 7: take today's fixture to the touchline. The CoachView drives the engine worker; `finishCoaching` records the log. */
    startCoaching(): void {
      const w = this.world; const f = this.todaysUserFixture;
      if (!w?.userClub || !f) return;
      const { setup, tactics, idMap } = fixtureSetup(toRaw(w), f);
      const names: Record<number, { name: string; role: string }> = {};
      for (const [local, pid] of idMap) { const p = w.persons[pid]; if (p) names[local] = { name: `${p.first} ${p.last}`, role: p.role }; }
      const coachTeam: 0 | 1 = f.home === w.userClub ? 0 : 1;
      const colours: [number, number] = [w.clubs[f.home]?.colours[0] ?? 0xe63946, w.clubs[f.away]?.colours[0] ?? 0x2a9df4];
      const shorts: [string, string] = [w.clubs[f.home]?.short ?? 'HOME', w.clubs[f.away]?.short ?? 'AWAY'];
      const clubNames: [string, string] = [this.clubName(f.home), this.clubName(f.away)];
      this.coaching = markRaw({ fixtureId: f.id, setup, seed: f.seed, tactics, coachTeam, colours, shorts, clubNames, names, title: `${this.clubName(f.home)} v ${this.clubName(f.away)} · day ${f.day} · ${f.phase}` });
      this.error = '';
    },
    async finishCoaching(log: MatchLog): Promise<void> {
      const c = this.coaching; if (!c || !this.world) return;
      this.busy = true;
      try {
        const r = await ask({ type: 'record', world: toRaw(this.world), fixtureId: c.fixtureId, log });
        if (r.type === 'world') { this.world = r.world; this.lastUserLog = markRaw(log); this.lastUserColours = c.colours; this.message = tr('season.msgRecorded'); }
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; this.coaching = null; }
    },
    abandonCoaching(): void { this.coaching = null; },
    /** Kit colours of the user's fixture among the given played fixtures. */
    coloursFor(ids: number[]): [number, number] | null {
      const w = this.world; if (!w?.userClub) return null;
      const f = w.season.fixtures.find((x) => ids.includes(x.id) && (x.home === w.userClub || x.away === w.userClub));
      return f ? [w.clubs[f.home]?.colours[0] ?? 0xe63946, w.clubs[f.away]?.colours[0] ?? 0x2a9df4] : null;
    },
    async save(slot = 'autosave'): Promise<void> {
      if (!this.world) return;
      await persistStorage();
      const doc: SaveFile = serialize(this.world, ENGINE_VERSION, new Date().toISOString());
      await saveSlot(slot, doc); this.slots = await listSlots(); this.message = tr('season.msgSaved', { slot });
    },
    async load(slot = 'autosave'): Promise<void> {
      const doc = await loadSlot(slot);
      if (!doc) { this.error = tr('season.errNoSave', { slot }); return; }
      this.world = deserialize(doc); this.message = tr('season.msgLoaded', { slot, year: this.world.year });
    },
    async refreshSlots(): Promise<void> { try { this.slots = await listSlots(); } catch { this.slots = []; } },
    exportJson(): string | null { return this.world ? JSON.stringify(serialize(this.world, ENGINE_VERSION, new Date().toISOString())) : null; },
    importJson(text: string): void { try { this.world = deserialize(text); this.message = tr('season.msgImported'); } catch (e) { this.error = e instanceof Error ? e.message : String(e); } },
  },
});
