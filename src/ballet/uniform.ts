import type { QueryResultRow } from 'pg';

import type { BalletAcademyRank } from './academy.js';

export const ACADEMY_UNIFORM_ROLES = {
  leotard: 'academy-leotard',
  tights: 'academy-tights',
  flats: 'academy-flat',
  pointe: 'academy-pointe',
} as const;

export interface AcademyUniformItem {
  readonly itemId: string;
  readonly displayName: string;
  readonly category: string;
  readonly minimumBalletLevel: number | null;
  readonly roles: readonly string[];
  readonly owned: boolean;
  readonly equipped: boolean;
  readonly purchasable: boolean;
  readonly active: boolean;
}

export interface AcademyUniformPiece {
  readonly slot: 'leotard' | 'tights' | 'shoes';
  readonly label: string;
  readonly satisfied: boolean;
  readonly equippedItemName: string | null;
  readonly ownedAlternatives: readonly string[];
  readonly availableAlternatives: readonly string[];
}

export interface AcademyUniformStatus {
  readonly rank: BalletAcademyRank;
  readonly balletLevel: number;
  readonly ready: boolean;
  readonly pointeRequired: boolean;
  readonly pieces: readonly AcademyUniformPiece[];
  readonly look: readonly string[];
  readonly optionalRankAccent: {
    readonly label: string;
    readonly equippedItemName: string | null;
    readonly ownedAlternatives: readonly string[];
    readonly availableAlternatives: readonly string[];
  } | null;
}

export interface AcademyUniformClaimResult {
  readonly items: readonly string[];
  readonly replacedItems: readonly string[];
  readonly replayed: boolean;
}

export interface AcademyUniformCatalogRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
  readonly category: string;
  readonly minimum_ballet_level: number | null;
  readonly academy_uniform_roles: unknown;
  readonly quantity: number | null;
  readonly equipped: boolean;
  readonly purchasable: boolean;
  readonly active: boolean;
}

const rankMinimumLevels: Readonly<Record<string, number>> = {
  student: 1,
  apprentice: 5,
  'repertoire-artist': 12,
  soloist: 20,
  'principal-artist': 35,
};

export function createAcademyUniformStatus(
  rank: BalletAcademyRank,
  items: readonly AcademyUniformItem[],
  pointeRequired = false,
  balletLevel = rankMinimumLevels[rank.id] ?? 1,
): AcademyUniformStatus {
  const requirements = [
    { slot: 'leotard', label: 'Leotard', role: ACADEMY_UNIFORM_ROLES.leotard },
    { slot: 'tights', label: 'Ballet tights', role: ACADEMY_UNIFORM_ROLES.tights },
    {
      slot: 'shoes',
      label: pointeRequired ? 'Pointe shoes for this activity' : 'Ballet flats',
      role: pointeRequired ? ACADEMY_UNIFORM_ROLES.pointe : ACADEMY_UNIFORM_ROLES.flats,
    },
  ] as const;

  const pieces = requirements.map((requirement): AcademyUniformPiece => {
    const matchingItems = items.filter((item) => item.roles.includes(requirement.role));
    const equipped = matchingItems.find((item) => item.equipped);
    return {
      slot: requirement.slot,
      label: requirement.label,
      satisfied: equipped !== undefined,
      equippedItemName: equipped?.displayName ?? null,
      ownedAlternatives: matchingItems.filter((item) => item.owned).map((item) => item.displayName),
      availableAlternatives: matchingItems
        .filter(
          (item) =>
            item.active &&
            item.purchasable &&
            (item.minimumBalletLevel === null || item.minimumBalletLevel <= balletLevel),
        )
        .map((item) => item.displayName),
    };
  });

  const look = items.filter((item) => item.equipped).map((item) => item.displayName);
  const accentDefinition: Readonly<
    Record<string, { readonly role: string; readonly label: string }>
  > = {
    apprentice: { role: 'academy-apprentice-accent', label: 'Apprentice wrap' },
    'repertoire-artist': { role: 'academy-repertoire-accent', label: 'Repertoire skirt' },
    soloist: { role: 'academy-soloist-accent', label: 'Soloist stage skirt' },
    'principal-artist': { role: 'academy-principal-accent', label: 'Principal presentation skirt' },
  };
  const accent = accentDefinition[rank.id];
  const accentItems =
    accent === undefined ? [] : items.filter((item) => item.roles.includes(accent.role));
  const optionalRankAccent =
    accent === undefined
      ? null
      : {
          label: accent.label,
          equippedItemName: accentItems.find((item) => item.equipped)?.displayName ?? null,
          ownedAlternatives: accentItems
            .filter((item) => item.owned)
            .map((item) => item.displayName),
          availableAlternatives: accentItems
            .filter(
              (item) =>
                item.active &&
                item.purchasable &&
                (item.minimumBalletLevel === null || item.minimumBalletLevel <= balletLevel),
            )
            .map((item) => item.displayName),
        };
  return {
    rank,
    balletLevel,
    ready: pieces.every((piece) => piece.satisfied),
    pointeRequired,
    pieces,
    look,
    optionalRankAccent,
  };
}

export function readAcademyUniformItems(
  rows: readonly AcademyUniformCatalogRow[],
): AcademyUniformItem[] {
  return rows.map((row) => ({
    itemId: row.item_id,
    displayName: row.display_name,
    category: row.category,
    minimumBalletLevel: row.minimum_ballet_level,
    roles: readRoles(row.academy_uniform_roles),
    owned: (row.quantity ?? 0) > 0,
    equipped: row.equipped,
    purchasable: row.purchasable,
    active: row.active,
  }));
}

export function formatUniformRequirement(status: AcademyUniformStatus): string {
  const missing = status.pieces.filter((piece) => !piece.satisfied);
  if (missing.length === 0) return 'Your Academy uniform is ready.';

  const lines = missing.map((piece) => {
    const owned = piece.ownedAlternatives;
    const available = piece.availableAlternatives;
    if (owned.length > 0) return `${piece.label}: equip ${owned.join(' or ')}.`;
    if (available.length > 0)
      return `${piece.label}: obtain ${available.join(' or ')} from the permanent Shop catalog.`;
    return `${piece.label}: no eligible permanent catalog item is currently available; please contact support.`;
  });
  return `Academy uniform required (${status.rank.title}). Missing or incorrect pieces:\n${lines.join('\n')}\nCheck /wardrobe uniform for your owned items.`;
}

function readRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is string => typeof role === 'string');
}
