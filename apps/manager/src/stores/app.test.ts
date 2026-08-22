import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from './app';

describe('app store', () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  it('routes screens, knows the hub family, and deep-links the rulebook', () => {
    const app = useAppStore();
    expect(['intro', 'title']).toContain(app.screen);
    app.go('squad');
    expect(app.inHub).toBe(true);
    app.go('coach');
    expect(app.inHub).toBe(false);
    app.openRule('rules.selfPass23');
    expect(app.screen).toBe('rulebook');
    expect(app.ruleFocus).toBe('rules.selfPass23');
    app.markSaved('2026-08-22T16:38:00');
    expect(app.savedClock).toBe('16:38');
  });
});
