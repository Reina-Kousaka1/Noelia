import { describe, expect, it } from 'vitest';

import { NOELIA_NAME, TECHNICAL_NAME } from '../src/identity.js';

describe('project identity', () => {
  it('keeps the display name and technical spelling distinct', () => {
    expect(NOELIA_NAME).toBe('Noélia');
    expect(TECHNICAL_NAME).toBe('Noelia');
  });
});
