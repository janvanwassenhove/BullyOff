import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@bullyoff/rules', () => {
  it('is wired into the workspace', () => {
    expect(PACKAGE_NAME).toBe('@bullyoff/rules');
  });
});
