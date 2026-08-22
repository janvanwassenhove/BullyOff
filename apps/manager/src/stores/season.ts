import { useAppStore } from './app';
import { defineStore } from 'pinia';
import { markRaw, toRaw } from 'vue';
import { ENGINE_VERSION, type CoachInstruction, type MatchLog, type MatchSetup, type TeamTactics } from '@bullyoff/engine';
import { deserialize, serialize, standings, fixturesToday, fixtureSetup, clubPlayers, ageOf, overall, type ClubId, type Fixture, type Person, type TableRow, type World, type SaveFile } from '@bullyoff/season';
import type { RegionFlavour } from '@bullyoff/worldgen';
import SeasonWorker from '../engine/season.worker?worker';
import type { FromSeason, ToSeason } from '../engine/season.worker';
import { loadSlot, saveSlot, listSlots, deleteSlot, persistStorage } from '../engine/persist';
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
  day: number;
  surface: string;
}

/** A finished user match for the report screen: the log, who we were, and what the coach did. */
export interface LastMatch {
  log: MatchLog;
  fixtureId: number;
  coachTeam: 0 | 1;
  colours: [number, number];
  shorts: [string, string];
  clubNames: [string, string];
  names: Record<number, string>;
  instructions: CoachInstruction[];
  day: number;
  surface: string;
  /** Table position before and after (1-based) for the user's club. */
  posBefore: number;
  posAfter: number;
  tier: number;
}

interface SeasonState {
  world: World | null;
  coaching: Coaching | null;
  lastMatch: LastMatch | null;
  busy: boolean;
  error: string;
  lastUserLog: MatchLog | null;
  /** Kit colours [home, away] of the last user match, for the viewer. */
  lastUserColours: [number, number] | null;
  lastPlayed: number[];
  slots: string[];
  message: string;
  /** Progress of the running worker request or null. */
  progress: { done: number; total: number; label: string } | null;
  /** Surface the user prefers for the career (home matches use the home club's pitch; this is the preview/new-career choice). */
  turf: 'watered' | 'dry' | 'wet';
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

export interface SquadRow { id: number; n: number; name: string; role: string; age: number; ovr: number; injured: number; goals: number; minutes: number; youth: boolean; captain: boolean; person: Person }

/** Perceived distance between two 0xRRGGBB colours (0 = identical, ~441 = black/white). */
function colourDistance(a: number, b: number): number {
  const dr = ((a >> 16) & 0xff) - ((b >> 16) & 0xff), dg = ((a >> 8) & 0xff) - ((b >> 8) & 0xff), db = (a & 0xff) - (b & 0xff);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
/**
 * Kit colours for a fixture. Hockey convention: the home side wears its first kit and the
 * visitors change when the shirts clash, so a red-v-red fixture shows the away club's second colour.
 */
export function kitPair(home: { colours: [number, number] } | undefined, away: { colours: [number, number] } | undefined): [number, number] {
  const h = home?.colours[0] ?? 0x1d3557;
  const a1 = away?.colours[0] ?? 0xe63946, a2 = away?.colours[1] ?? 0xffffff;
  const clash = colourDistance(h, a1) < 110;
  return [h, clash && colourDistance(h, a2) >= 110 ? a2 : clash ? 0xf4f1e8 : a1];
}

export const useSeasonStore = defineStore('season', {
  state: (): SeasonState => ({ world: null, coaching: null, lastMatch: null, busy: false, error: '', lastUserLog: null, lastUserColours: null, lastPlayed: [], slots: [], message: '', progress: null, turf: 'watered' }),
  getters: {
    userClub: (s) => (s.world?.userClub ? s.world.clubs[s.world.userClub] ?? null : null),
    table(): TableRow[] { return this.world && this.userClub ? standings(this.world, this.userClub.tier) : []; },
    /** 1-based table position of the user's club (0 when unknown). */
    userPosition(): number { const u = this.world?.userClub; return u ? this.table.findIndex((r) => r.club === u) + 1 : 0; },
    today(): Fixture[] { return this.world ? fixturesToday(this.world) : []; },
    nextUserFixture(): Fixture | null {
      if (!this.world?.userClub) return null;
      const u = this.world.userClub;
      return this.world.season.fixtures.filter((f) => !f.played && (f.home === u || f.away === u)).sort((a, b) => a.day - b.day)[0] ?? null;
    },
    /** Every fixture of the user's club this season, by day. */
    userFixtures(): Fixture[] {
      const w = this.world; if (!w?.userClub) return [];
      const u = w.userClub;
      return w.season.fixtures.filter((f) => f.home === u || f.away === u).sort((a, b) => a.day - b.day);
    },
    /** Played user fixtures, newest first. */
    userResults(): Fixture[] { return [...this.userFixtures].filter((f) => f.played && f.result).reverse(); },
    /** Last five results as W/D/L from the user's point of view (oldest first). */
    form(): ('W' | 'D' | 'L')[] {
      const u = this.world?.userClub; if (!u) return [];
      return this.userResults.slice(0, 5).reverse().map((f) => {
        const r = f.result; if (!r) return 'D';
        const mine = f.home === u ? r.home : r.away, theirs = f.home === u ? r.away : r.home;
        if (r.shootOut) { const so = f.home === u ? r.shootOut[0] > r.shootOut[1] : r.shootOut[1] > r.shootOut[0]; return so ? 'W' : 'L'; }
        return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
      });
    },
    /** Home goals per match for the user (the form note). */
    homeGoalsPerMatch(): number {
      const u = this.world?.userClub; if (!u) return 0;
      const home = this.userResults.filter((f) => f.home === u && f.result);
      return home.length ? Math.round((10 * home.reduce((s, f) => s + (f.result?.home ?? 0), 0)) / home.length) / 10 : 0;
    },
    squad(): SquadRow[] {
      const w = this.world;
      if (!w?.userClub) return [];
      const uc = w.userClub;
      const ps = clubPlayers(w, uc, true);
      const captain = [...ps].filter((p) => !p.youth).sort((a, b) => ageOf(b, w.year) - ageOf(a, w.year) || overall(b) - overall(a))[0];
      return ps.map((p, i) => ({ id: p.id, n: i + 1, name: `${p.first} ${p.last}`, role: p.role, age: ageOf(p, w.year), ovr: Math.round(overall(p) * 5), injured: p.injuredDays, goals: p.goals, minutes: p.minutes, youth: p.youth, captain: p.id === captain?.id, person: p }));
    },
    treatmentRoom(): SquadRow[] { return this.squad.filter((r) => r.injured > 0).sort((a, b) => b.injured - a.injured); },
    clubName(): (id: ClubId) => string { return (id) => this.world?.clubs[id]?.name ?? id; },
    /** The user's fixture on today's match day, if any (coachable). */
    todaysUserFixture(): Fixture | null {
      const w = this.world; if (!w?.userClub) return null;
      const u = w.userClub;
      return fixturesToday(w).find((f) => f.home === u || f.away === u) ?? null;
    },
    /** Scouting line for the next opponent: goals for/against in their played fixtures. */
    nextOpponent(): { club: ClubId; name: string; away: boolean; day: number; goals: number; conceded: number; played: number } | null {
      const w = this.world; const f = this.nextUserFixture; if (!w?.userClub || !f) return null;
      const opp = f.home === w.userClub ? f.away : f.home;
      const theirs = w.season.fixtures.filter((x) => x.played && x.result && (x.home === opp || x.away === opp));
      let goals = 0, conceded = 0;
      for (const x of theirs) { const r = x.result; if (!r) continue; if (x.home === opp) { goals += r.home; conceded += r.away; } else { goals += r.away; conceded += r.home; } }
      return { club: opp, name: this.clubName(opp), away: f.away === w.userClub, day: f.day, goals, conceded, played: theirs.length };
    },
  },
  actions: {
    async newWorld(seed: number, profile: 'mens' | 'womens', flavour: RegionFlavour = 'mixed', historyYears = 20): Promise<void> {
      this.busy = true; this.error = ''; this.message = historyYears > 0 ? tr('season.msgWriting', { n: historyYears }) : tr('season.msgGenerating');
      try {
        const r = await ask({ type: 'create', seed, profile, opts: { flavour, historyYears } });
        if (r.type === 'world') { this.world = r.world; this.lastUserLog = null; this.lastMatch = null; this.message = tr('season.msgNewWorld', { n: r.world.history.length }); }
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; }
    },
    pickClub(id: ClubId): void { if (this.world) this.world.userClub = id; },
    async playDay(): Promise<void> {
      if (!this.world) return;
      this.busy = true; this.error = '';
      const posBefore = this.userPosition;
      try {
        const r = await ask({ type: 'day', world: toRaw(this.world), userClub: this.world.userClub });
        if (r.type === 'world') {
          this.world = r.world;
          if (r.userLog) { this.lastUserLog = markRaw(r.userLog); this.lastUserColours = this.coloursFor(r.playedFixtureIds); this.recordLastMatch(r.userLog, r.playedFixtureIds, [], posBefore); }
          this.lastPlayed = r.playedFixtureIds; this.message = tr('season.msgDayPlayed', { day: r.world.season.day, n: r.playedFixtureIds.length });
        }
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
    /** Take today's fixture to the touchline. The CoachView drives the engine worker; `finishCoaching` records the log. */
    startCoaching(): void {
      const w = this.world; const f = this.todaysUserFixture;
      if (!w?.userClub || !f) return;
      const { setup, tactics, idMap } = fixtureSetup(toRaw(w), f);
      const names: Record<number, { name: string; role: string }> = {};
      for (const [local, pid] of idMap) { const p = w.persons[pid]; if (p) names[local] = { name: `${p.first} ${p.last}`, role: p.role }; }
      const coachTeam: 0 | 1 = f.home === w.userClub ? 0 : 1;
      const colours = kitPair(w.clubs[f.home], w.clubs[f.away]);
      const shorts: [string, string] = [w.clubs[f.home]?.short ?? 'HOME', w.clubs[f.away]?.short ?? 'AWAY'];
      const clubNames: [string, string] = [this.clubName(f.home), this.clubName(f.away)];
      this.coaching = markRaw({ fixtureId: f.id, setup, seed: f.seed, tactics, coachTeam, colours, shorts, clubNames, names, title: `${clubNames[0]} v ${clubNames[1]}`, day: f.day, surface: setup.surface });
      this.error = '';
    },
    async finishCoaching(log: MatchLog, instructions: CoachInstruction[]): Promise<void> {
      const c = this.coaching; if (!c || !this.world) return;
      this.busy = true;
      const posBefore = this.userPosition;
      try {
        const r = await ask({ type: 'record', world: toRaw(this.world), fixtureId: c.fixtureId, log });
        if (r.type === 'world') {
          this.world = r.world; this.lastUserLog = markRaw(log); this.lastUserColours = c.colours;
          // The other fixtures of the round are played out the moment the coached one is recorded, so the
          // hub never shows a half-finished matchday and the next coachable fixture is immediately available.
          if (r.world.season.fixtures.some((x) => x.day === c.day && !x.played)) {
            const d = await ask({ type: 'day', world: toRaw(r.world), userClub: r.world.userClub });
            if (d.type === 'world') { this.world = d.world; this.lastPlayed = d.playedFixtureIds; }
          }
          const names: Record<number, string> = {}; for (const [k, v] of Object.entries(c.names)) names[Number(k)] = v.name;
          const lm: LastMatch = { log, fixtureId: c.fixtureId, coachTeam: c.coachTeam, colours: c.colours, shorts: c.shorts, clubNames: c.clubNames, names, instructions, day: c.day, surface: c.surface, posBefore, posAfter: this.userPosition, tier: this.userClub?.tier ?? 1 };
          this.lastMatch = markRaw(lm);
          this.message = tr('season.msgRecorded');
          await this.save();
        }
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); } finally { this.busy = false; this.coaching = null; }
    },
    abandonCoaching(): void { this.coaching = null; },
    /** Build a LastMatch from a simulated (not coached) user fixture so the report screen works for sims too. */
    recordLastMatch(log: MatchLog, ids: number[], instructions: CoachInstruction[], posBefore: number): void {
      const w = this.world; if (!w?.userClub) return;
      const f = w.season.fixtures.find((x) => ids.includes(x.id) && (x.home === w.userClub || x.away === w.userClub)); if (!f) return;
      const { idMap } = fixtureSetup(toRaw(w), f);
      const names: Record<number, string> = {};
      for (const [local, pid] of idMap) { const p = w.persons[pid]; if (p) names[local] = `${p.first} ${p.last}`; }
      const lm: LastMatch = {
        log, fixtureId: f.id, coachTeam: f.home === w.userClub ? 0 : 1,
        colours: kitPair(w.clubs[f.home], w.clubs[f.away]),
        shorts: [w.clubs[f.home]?.short ?? 'HOME', w.clubs[f.away]?.short ?? 'AWAY'], clubNames: [this.clubName(f.home), this.clubName(f.away)],
        names, instructions, day: f.day, surface: w.clubs[f.home]?.surface ?? 'watered', posBefore, posAfter: this.userPosition, tier: this.userClub?.tier ?? 1,
      };
      this.lastMatch = markRaw(lm);
    },
    /** Kit colours of the user's fixture among the given played fixtures. */
    coloursFor(ids: number[]): [number, number] | null {
      const w = this.world; if (!w?.userClub) return null;
      const f = w.season.fixtures.find((x) => ids.includes(x.id) && (x.home === w.userClub || x.away === w.userClub));
      return f ? kitPair(w.clubs[f.home], w.clubs[f.away]) : null;
    },
    async save(slot = 'autosave'): Promise<string | null> {
      if (!this.world) return null;
      await persistStorage();
      const at = new Date().toISOString();
      useAppStore().markSaved(at);
      const doc: SaveFile = serialize(toRaw(this.world), ENGINE_VERSION, at);
      await saveSlot(slot, doc); this.slots = await listSlots(); this.message = tr('season.msgSaved', { slot });
      return at;
    },
    async load(slot = 'autosave'): Promise<boolean> {
      const doc = await loadSlot(slot);
      if (!doc) { this.error = tr('season.errNoSave', { slot }); return false; }
      this.world = deserialize(doc); this.lastMatch = null; this.message = tr('season.msgLoaded', { slot, year: this.world.year });
      return true;
    },
    async deleteSave(slot: string): Promise<void> { await deleteSlot(slot); this.slots = await listSlots(); },
    async refreshSlots(): Promise<void> { try { this.slots = await listSlots(); } catch { this.slots = []; } },
    async peekSave(slot = 'autosave'): Promise<SaveFile | undefined> { try { return await loadSlot(slot); } catch { return undefined; } },
    exportJson(): string | null { return this.world ? JSON.stringify(serialize(toRaw(this.world), ENGINE_VERSION, new Date().toISOString())) : null; },
    importJson(text: string): void { try { this.world = deserialize(text); this.lastMatch = null; this.message = tr('season.msgImported'); } catch (e) { this.error = e instanceof Error ? e.message : String(e); } },
  },
});
