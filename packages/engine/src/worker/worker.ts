/**
 * Web Worker entry point. The only file in the engine that touches a worker
 * global, and it does nothing but wire `self` to the pure host. Import it from
 * a Vite app as `new Worker(new URL('@bullyoff/engine/worker', import.meta.url), { type: 'module' })`.
 */
import { createEngineHost } from './host.js';
import type { FromEngine, ToEngine } from './protocol.js';

declare const self: {
  postMessage(msg: FromEngine): void;
  onmessage: ((ev: { data: ToEngine }) => void) | null;
};

const host = createEngineHost((msg) => { self.postMessage(msg); });
self.onmessage = (ev): void => { host.handle(ev.data); };
