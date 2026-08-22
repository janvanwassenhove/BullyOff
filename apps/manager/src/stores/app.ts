/**
 * App-level UI state (design handoff § State management): which screen is up,
 * the intro/film flags, the presentation-only camera + overlay choice, and the
 * post-match report hand-off. Presentation only — nothing here touches a log.
 */
import { defineStore } from 'pinia';
import type { CameraChoice, OverlayId } from '@bullyoff/render';

export type Screen =
  | 'intro' | 'title' | 'newCareer' | 'clubSelect'
  | 'season' | 'squad' | 'tactics' | 'club' | 'rulebook'
  | 'coach' | 'report' | 'viewer' | 'about';

interface AppState {
  screen: Screen;
  intro: { seen: boolean; filmPlaying: boolean; muted: boolean };
  camera: CameraChoice;
  overlay: OverlayId;
  /** ISO time of the last save (for the "SAVED 16:38" status). */
  savedAt: string | null;
  /** Which player is open in the squad screen (person id). */
  selectedPerson: number | null;
  /** Which club card is selected on the club-selection screen. */
  selectedClub: string | null;
  /** Rule card to scroll to when the rulebook opens (e.g. 'rules.selfPass23'). */
  ruleFocus: string | null;
}

const KEY_INTRO = 'bullyoff.intro.seen';
const KEY_MUTED = 'bullyoff.intro.muted';
const KEY_SAVED = 'bullyoff.savedAt';
const read = (k: string): string | null => { try { return globalThis.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string): void => { try { globalThis.localStorage.setItem(k, v); } catch { /* private mode */ } };

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    screen: read(KEY_INTRO) === '1' ? 'title' : 'intro',
    intro: { seen: read(KEY_INTRO) === '1', filmPlaying: false, muted: read(KEY_MUTED) !== '0' },
    camera: 'broadcast',
    overlay: 'none',
    savedAt: read(KEY_SAVED),
    selectedPerson: null,
    selectedClub: null,
    ruleFocus: null,
  }),
  getters: {
    /** The season-hub family of screens shares the app bar + club bar. */
    inHub: (s): boolean => ['season', 'squad', 'tactics', 'club', 'rulebook'].includes(s.screen),
    savedClock(): string | null {
      if (!this.savedAt) return null;
      const d = new Date(this.savedAt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
  },
  actions: {
    go(screen: Screen): void { this.screen = screen; },
    /** Open the rulebook on a rule (from the report's READ THE RULE → or the engine view). */
    openRule(key: string | null): void { this.ruleFocus = key; this.screen = 'rulebook'; },
    skipIntro(): void { this.intro.seen = true; this.intro.filmPlaying = false; write(KEY_INTRO, '1'); if (this.screen === 'intro') this.screen = 'title'; },
    toggleMuted(): void { this.intro.muted = !this.intro.muted; write(KEY_MUTED, this.intro.muted ? '1' : '0'); },
    setCamera(c: CameraChoice): void { this.camera = c; },
    setOverlay(o: OverlayId): void { this.overlay = o; },
    markSaved(iso: string): void { this.savedAt = iso; write(KEY_SAVED, iso); },
  },
});
