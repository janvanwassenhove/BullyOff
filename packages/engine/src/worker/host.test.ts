import { describe, expect, it } from 'vitest';
import { createEngineHost } from './host.js';
import type { FromEngine } from './protocol.js';
import { sandboxScript, sandboxSetup } from '../sim/fixtures.js';
import { simulate } from '../match/match.js';
import { hashLog } from '../sim/hash.js';

describe('engine host (worker adapter, no worker)', () => {
  it('init → commands → advance streams the same events/frames as simulate()', () => {
    const out: FromEngine[] = [];
    const host = createEngineHost((m) => out.push(m));
    const setup = sandboxSetup();
    const script = sandboxScript(5, 200);

    host.handle({ type: 'init', id: 1, setup, seed: 5 });
    host.handle({ type: 'commands', id: 2, commands: script });
    host.handle({ type: 'advance', id: 3, ticks: 120 });
    host.handle({ type: 'advance', id: 4, ticks: 80 });
    host.handle({ type: 'end', id: 5 });

    const ready = out[0];
    expect(ready?.type).toBe('ready');
    const streamed = out.filter((m): m is Extract<FromEngine, { type: 'events' }> => m.type === 'events');
    expect(streamed.length).toBe(2);
    expect(streamed[0]?.fromTick).toBe(0);
    expect(streamed[1]?.toTick).toBe(200);

    const ref = simulate(setup, 5, script, 200);
    const events = [
      ...(ready?.type === 'ready' ? ready.events : []),
      ...streamed.flatMap((m) => m.events),
      ...out.filter((m): m is Extract<FromEngine, { type: 'ended' }> => m.type === 'ended').flatMap((m) => m.events),
    ];
    const frames = streamed.flatMap((m) => m.frames);
    expect(hashLog({ header: ref.header, events, frames })).toBe(hashLog(ref));
  });

  it('simulate message returns a hashed log; errors are reported not thrown', () => {
    const out: FromEngine[] = [];
    const host = createEngineHost((m) => out.push(m));
    host.handle({ type: 'advance', id: 9, ticks: 1 });
    expect(out[0]?.type).toBe('error');
    host.handle({ type: 'simulate', id: 10, setup: sandboxSetup(), seed: 3, script: sandboxScript(3, 100), ticks: 100 });
    const log = out[1];
    expect(log?.type === 'log' && log.hash).toBe(hashLog(simulate(sandboxSetup(), 3, sandboxScript(3, 100), 100)));
  });

  it('every message is structured-clone safe', () => {
    const out: FromEngine[] = [];
    const host = createEngineHost((m) => out.push(m));
    host.handle({ type: 'simulate', id: 1, setup: sandboxSetup(), seed: 1, script: sandboxScript(1, 50), ticks: 50 });
    for (const m of out) expect(() => structuredClone(m)).not.toThrow();
  });
});
