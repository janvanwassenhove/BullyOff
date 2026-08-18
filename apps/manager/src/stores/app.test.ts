import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from './app';

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it('starts in Phase 0', () => {
    expect(useAppStore().phase).toBe(0);
  });
});
