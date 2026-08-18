import { describe, expect, it } from 'vitest';
import { DT, PACKAGE_NAME, TICK_HZ } from './index.js';

describe('@bullyoff/engine', () => {
  it('is wired into the workspace', () => {
    expect(PACKAGE_NAME).toBe('@bullyoff/engine');
  });
  it('runs at the decided fixed tick rate', () => {
    expect(TICK_HZ).toBe(20);
    expect(DT * TICK_HZ).toBe(1);
  });
});
