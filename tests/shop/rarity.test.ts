import { describe, expect, it } from 'vitest';

import { parseShopRarity, SHOP_RARITIES, SHOP_RARITY_LABELS } from '../../src/shop/rarity.js';

describe('shop rarity catalog', () => {
  it('defines the presentation-only rarity set centrally', () => {
    expect(SHOP_RARITIES).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary']);
    expect(SHOP_RARITY_LABELS.legendary).toBe('Legendary');
    expect(parseShopRarity('rare')).toBe('rare');
  });

  it('rejects unsupported persisted rarity values rather than casting them', () => {
    expect(() => parseShopRarity('mythic')).toThrow('Unsupported shop rarity in catalog.');
  });
});
