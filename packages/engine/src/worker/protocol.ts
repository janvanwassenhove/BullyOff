/**
 * Typed message protocol between a UI thread and the engine host (ADR-008).
 * Plain, structured-clone-safe objects only. No Map/Set, no functions.
 */
import type { Frame, MatchEvent, MatchLogHeader } from '../events/events.js';
import type { Command } from '../match/commands.js';
import type { MatchSetup } from '../match/match.js';

export type ToEngine =
  | { type: 'init'; id: number; setup: MatchSetup; seed: number }
  | { type: 'commands'; id: number; commands: Command[] }
  /** Advance N ticks, replying with the events (and frames) produced. */
  | { type: 'advance'; id: number; ticks: number }
  | { type: 'end'; id: number }
  /** Batch: simulate a whole scripted match in one go and reply with the full log. */
  | { type: 'simulate'; id: number; setup: MatchSetup; seed: number; script: Command[]; ticks: number };

export type FromEngine =
  | { type: 'ready'; id: number; header: MatchLogHeader; events: MatchEvent[] }
  | { type: 'events'; id: number; fromTick: number; toTick: number; events: MatchEvent[]; frames: Frame[] }
  | { type: 'ended'; id: number; events: MatchEvent[] }
  | { type: 'log'; id: number; header: MatchLogHeader; events: MatchEvent[]; frames: Frame[]; hash: string }
  | { type: 'error'; id: number; message: string };
