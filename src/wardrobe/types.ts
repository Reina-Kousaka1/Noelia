export const WARDROBE_SLOTS = [
  'leotard',
  'skirt',
  'wrap',
  'outerwear',
  'legwear',
  'tights',
  'shoes',
  'bag',
  'hair_accessory',
  'jewelry',
  'accessory',
] as const;

export type WardrobeSlot = (typeof WARDROBE_SLOTS)[number];

export interface WardrobeOutfitItem {
  readonly itemId: string;
  readonly displayName: string;
  readonly slots: readonly WardrobeSlot[];
  readonly equippedAt: Date;
}

export interface WardrobeEquipResult {
  readonly itemId: string;
  readonly displayName: string;
  readonly slots: readonly WardrobeSlot[];
  readonly displacedItems: readonly { readonly itemId: string; readonly displayName: string }[];
}

export interface WardrobePresetSummary {
  readonly presetId: string;
  readonly name: string;
  readonly itemCount: number;
}

export interface WardrobePresetMutationResult extends WardrobePresetSummary {
  readonly replayed: boolean;
}

export interface WardrobePresetItem {
  readonly itemId: string;
  readonly displayName: string;
  readonly slots: readonly WardrobeSlot[];
}

export interface WardrobePresetApplyResult {
  readonly presetId: string;
  readonly name: string;
  readonly outfit: readonly WardrobePresetItem[];
  readonly replayed: boolean;
}

export interface WardrobeClearResult {
  readonly removedItemCount: number;
  readonly replayed: boolean;
}

export interface WardrobePresetPort {
  clear(interactionId: string, discordUserId: string): Promise<WardrobeClearResult>;
  listPresets(discordUserId: string): Promise<readonly WardrobePresetSummary[]>;
  createPreset(
    interactionId: string,
    discordUserId: string,
    name: string,
  ): Promise<WardrobePresetMutationResult>;
  savePreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
  ): Promise<WardrobePresetMutationResult>;
  applyPreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
  ): Promise<WardrobePresetApplyResult>;
  renamePreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
    name: string,
  ): Promise<WardrobePresetMutationResult>;
  deletePreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
  ): Promise<WardrobePresetMutationResult>;
}

export interface WardrobePort {
  getOutfit(discordUserId: string): Promise<readonly WardrobeOutfitItem[]>;
  equip(discordUserId: string, itemId: string): Promise<WardrobeEquipResult>;
  unequip(discordUserId: string, slot: WardrobeSlot): Promise<WardrobeOutfitItem | undefined>;
}
