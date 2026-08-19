import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from './app';

describe('app store', () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  it('reports the current phase', () => { expect(useAppStore().phase).toBe(5); });
});
