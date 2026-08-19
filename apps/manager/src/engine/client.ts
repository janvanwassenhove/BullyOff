/**
 * Engine client for the UI thread (ADR-008): one Web Worker, typed messages,
 * promise per request. Match state never lives here — only logs come back.
 */
import type { FromEngine, MatchLog, ToEngine } from '@bullyoff/engine';
import EngineWorker from '@bullyoff/engine/worker?worker';

interface Pending { resolve: (m: FromEngine) => void; reject: (e: Error) => void }
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new EngineWorker();
    this.worker.onmessage = (ev: MessageEvent<FromEngine>) => {
      const m = ev.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
    };
  }

  private send(msg: DistributiveOmit<ToEngine, 'id'>): Promise<FromEngine> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  async simulateAi(profile: 'mens' | 'womens', surface: 'dry' | 'watered' | 'wet', seed: number, frameEvery = 1): Promise<MatchLog> {
    const m = await this.send({ type: 'simulateAi', profile, surface, seed, frameEvery });
    if (m.type !== 'log') throw new Error('unexpected reply');
    return { header: m.header, events: m.events, frames: m.frames };
  }

  async scenario(scenarioId: string): Promise<MatchLog> {
    const m = await this.send({ type: 'scenario', scenarioId });
    if (m.type !== 'log') throw new Error('unexpected reply');
    return { header: m.header, events: m.events, frames: m.frames };
  }

  destroy(): void { this.worker.terminate(); }
}
