import type {
  EquippedOutfit,
  NoeliaWardrobeSlot,
} from "../domain/academyProfile";
import type { AvatarLayerSlot } from "./avatarModel";

const wardrobeSlotToAvatarLayer: Readonly<Record<NoeliaWardrobeSlot, AvatarLayerSlot>> = {
  leotard: "top",
  skirt: "bottom",
  wrap: "accessories",
  outerwear: "accessories",
  legwear: "legwear",
  tights: "legwear",
  shoes: "shoes",
  bag: "accessories",
  hair_accessory: "hairAccessory",
  jewelry: "accessories",
  accessory: "accessories",
};

/** Maps domain equipment slots into future avatar render-layer buckets. */
export function mapOutfitToAvatarLayers(
  outfit: readonly EquippedOutfit[],
): Readonly<Record<AvatarLayerSlot, readonly EquippedOutfit[]>> {
  const layers: Record<AvatarLayerSlot, EquippedOutfit[]> = {
    base: [],
    hair: [],
    top: [],
    bottom: [],
    legwear: [],
    shoes: [],
    accessories: [],
    hairAccessory: [],
    foregroundEffects: [],
  };

  for (const item of outfit) {
    for (const slot of item.slots) layers[wardrobeSlotToAvatarLayer[slot]].push(item);
  }

  return layers;
}
