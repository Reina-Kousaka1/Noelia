import { describe, expect, it } from 'vitest';

import { buildPingResponse } from '../../src/commands/ping/response.js';

describe('buildPingResponse', () => {
  it('includes the current gateway latency when it is valid', () => {
    expect(buildPingResponse(41.6)).toBe('Pong! Noélia is ready. 🩰 Gateway: 42 ms.');
  });

  it('omits invalid or unavailable latency values', () => {
    expect(buildPingResponse(undefined)).toBe('Pong! Noélia is ready. 🩰');
    expect(buildPingResponse(Number.NaN)).toBe('Pong! Noélia is ready. 🩰');
    expect(buildPingResponse(-1)).toBe('Pong! Noélia is ready. 🩰');
  });
});
