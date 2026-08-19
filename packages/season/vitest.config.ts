import { defineConfig } from 'vitest/config';

// The real-engine season tests block for minutes; run them in a forked process (IPC, no worker-thread
// RPC heartbeat to starve) and give them room.
export default defineConfig({
  test: { name: 'season', environment: 'node', include: ['src/**/*.{test,spec}.ts'], testTimeout: 300_000, pool: 'forks' },
});
