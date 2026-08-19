/**
 * Typed message protocol between a UI thread and the engine host (ADR-008).
 * Plain, structured-clone-safe objects only. No Map/Set, no functions.
 */
import type { Frame, MatchEvent, MatchLogHeader } from '../events/events.js';
import type { Command } from '../match/commands.js';
import type { CoachInstruction } from '../ai/brain.js';
import type { TeamTactics } from '../ai/tactics.js';
import type { MatchSetup } from '../match/match.js';
import type { ProfileId, SurfaceState } from '../profile.js';

export type ToEngine =
  | { type: 'init'; id: number; setup: MatchSetup; seed: number }
  | { type: 'commands'; id: number; commands: Command[] }
  /**
   * Coached mode (Phase 7): create a match with the utility AI driving both squads from `setup`
   * (roles/attributes/bench) and `tactics`; then `advance` step by step and `instruct` the coach's team.
   */
  | { type: 'initAi'; id: number; setup: MatchSetup; seed: number; tactics: [TeamTactics, TeamTactics] }
  /** Queue tick-stamped coach instructions for the AI (coached mode only). */
  | { type: 'instruct'; id: number; instructions: CoachInstruction[] }
  /** Advance N ticks, replying with the events (and frames) produced. */
  | { type: 'advance'; id: number; ticks: number }
  | { type: 'end'; id: number }
  /** Batch: simulate a whole scripted match in one go and reply with the full log. */
  | { type: 'simulate'; id: number; setup: MatchSetup; seed: number; script: Command[]; ticks: number }
  /** Play a full AI match (both sides the utility AI) and reply with the full log incl. frames every `frameEvery` ticks. */
  | { type: 'simulateAi'; id: number; profile: ProfileId; surface: SurfaceState; seed: number; frameEvery?: number; level?: number; maxTicks?: number }
  /** Run a §6.2 scenario fixture by id with frames, reply with the log. */
  | { type: 'scenario'; id: number; scenarioId: string };

export type FromEngine =
  | { type: 'ready'; id: number; header: MatchLogHeader; events: MatchEvent[] }
  /** Reply to `instruct`: the current tactics of both teams after applying (queued ones apply on their tick). */
  | { type: 'instructed'; id: number; tactics: [TeamTactics, TeamTactics] }
  | { type: 'events'; id: number; fromTick: number; toTick: number; events: MatchEvent[]; frames: Frame[] }
  | { type: 'ended'; id: number; events: MatchEvent[] }
  | { type: 'log'; id: number; header: MatchLogHeader; events: MatchEvent[]; frames: Frame[]; hash: string }
  | { type: 'error'; id: number; message: string };
