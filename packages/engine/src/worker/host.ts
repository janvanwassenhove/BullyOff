/**
 * Engine host: a pure message handler. Give it a `post` function and feed it
 * `ToEngine` messages; it owns one MatchState. Runs identically inside a Web
 * Worker (see worker.ts), in Node, or in a unit test with a fake `post`.
 * The engine itself knows nothing about workers.
 */
import type { Command } from '../match/commands.js';
import { captureFrame, createMatch, endMatch, simulate, tick, type MatchState } from '../match/match.js';
import type { Frame, MatchEvent } from '../events/events.js';
import { hashLog } from '../sim/hash.js';
import type { FromEngine, ToEngine } from './protocol.js';

export interface EngineHost {
  handle(msg: ToEngine): void;
}

export function createEngineHost(post: (msg: FromEngine) => void): EngineHost {
  let state: MatchState | null = null;
  const pending: Command[] = [];

  return {
    handle(msg: ToEngine): void {
      try {
        switch (msg.type) {
          case 'init': {
            const m = createMatch(msg.setup, msg.seed);
            state = m.state; pending.length = 0;
            post({ type: 'ready', id: msg.id, header: m.header, events: m.events });
            return;
          }
          case 'commands': {
            pending.push(...msg.commands);
            return;
          }
          case 'advance': {
            if (!state) { post({ type: 'error', id: msg.id, message: 'advance before init' }); return; }
            const s = state;
            const fromTick = s.tick;
            const events: MatchEvent[] = [];
            const frames: Frame[] = [];
            for (let i = 0; i < msg.ticks && !s.ended; i++) {
              if (s.tick % s.frameEvery === 0) frames.push(captureFrame(s));
              events.push(...tick(s, pending));
              // drop consumed commands (those stamped ≤ current tick − 1)
              for (let j = pending.length - 1; j >= 0; j--) if ((pending[j]?.tick ?? 0) < s.tick) pending.splice(j, 1);
            }
            post({ type: 'events', id: msg.id, fromTick, toTick: s.tick, events, frames });
            return;
          }
          case 'end': {
            if (!state) { post({ type: 'error', id: msg.id, message: 'end before init' }); return; }
            post({ type: 'ended', id: msg.id, events: endMatch(state) });
            return;
          }
          case 'simulate': {
            const log = simulate(msg.setup, msg.seed, msg.script, msg.ticks);
            post({ type: 'log', id: msg.id, header: log.header, events: log.events, frames: log.frames, hash: hashLog(log) });
            return;
          }
        }
      } catch (e) {
        post({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) });
      }
    },
  };
}
