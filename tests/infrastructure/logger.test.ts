import { describe, expect, it } from 'vitest';

import { redactSensitiveText } from '../../src/infrastructure/logging/logger.js';

describe('redactSensitiveText', () => {
  it('redacts known credentials and credential-shaped content', () => {
    const secret = 'local-database-password-value';
    const message = `request failed for ${secret}; token=other-secret-value`;

    const result = redactSensitiveText(message, [secret]);

    expect(result).not.toContain(secret);
    expect(result).not.toContain('other-secret-value');
    expect(result).toContain('[REDACTED]');
  });
});
