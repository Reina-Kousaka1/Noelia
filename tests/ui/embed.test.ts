import { describe, expect, it } from 'vitest';

import { createNoeliaEmbed } from '../../src/ui/embed.js';
import { NOELIA_THEME } from '../../src/ui/theme.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

describe('Noélia embed theme', () => {
  it('applies central Balletcore theme tokens and footer consistently', () => {
    expect(createNoeliaEmbed({ title: 'Studio progress', description: 'Level 2' })).toEqual({
      title: 'Studio progress',
      color: NOELIA_THEME.colors.balletPink,
      footer: { text: NOELIA_COPY.embedFooter },
      description: 'Level 2',
    });
  });

  it('uses semantic success and warning colors and preserves fields', () => {
    const fields = [{ name: 'Wallet', value: '20 Ballet Slippers', inline: true }];

    expect(createNoeliaEmbed({ title: 'Saved', tone: 'success', fields })).toMatchObject({
      color: NOELIA_THEME.colors.success,
      fields,
    });
    expect(createNoeliaEmbed({ title: 'Note', tone: 'warning' }).color).toBe(
      NOELIA_THEME.colors.warning,
    );
  });
});
