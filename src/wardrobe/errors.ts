import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class WardrobeItemNotOwnedError extends ExpectedDomainError {
  public constructor() {
    super(
      'The user tried to equip an inventory item they do not own.',
      'You need to own that item before equipping it.',
    );
    this.name = 'WardrobeItemNotOwnedError';
  }
}

export class WardrobeItemNotWearableError extends ExpectedDomainError {
  public constructor() {
    super(
      'The selected item has no supported wardrobe slots.',
      'That item cannot be equipped in the wardrobe.',
    );
    this.name = 'WardrobeItemNotWearableError';
  }
}

export class WardrobeSlotError extends ExpectedDomainError {
  public constructor() {
    super('The requested wardrobe slot is invalid.', 'Choose a valid wardrobe slot.');
    this.name = 'WardrobeSlotError';
  }
}

export class WardrobePresetInvalidNameError extends ExpectedDomainError {
  public constructor() {
    super(
      'The wardrobe preset name did not meet the naming policy.',
      'Use a 1–32 character preset name with letters, numbers, spaces, hyphens, apostrophes, or underscores.',
    );
    this.name = 'WardrobePresetInvalidNameError';
  }
}

export class WardrobePresetNameTakenError extends ExpectedDomainError {
  public constructor() {
    super(
      'The user already has a wardrobe preset with that normalized name.',
      'You already have a preset with that name. Rename it or choose another name.',
    );
    this.name = 'WardrobePresetNameTakenError';
  }
}

export class WardrobePresetNotFoundError extends ExpectedDomainError {
  public constructor() {
    super(
      'The requested wardrobe preset does not belong to the user.',
      'That preset was not found.',
    );
    this.name = 'WardrobePresetNotFoundError';
  }
}

export class WardrobePresetEmptyOutfitError extends ExpectedDomainError {
  public constructor() {
    super(
      'The user tried to save an empty outfit as a wardrobe preset.',
      'Equip at least one piece before saving an outfit preset.',
    );
    this.name = 'WardrobePresetEmptyOutfitError';
  }
}

export class WardrobePresetItemsUnavailableError extends ExpectedDomainError {
  public constructor(itemNames: readonly string[]) {
    const names = itemNames.slice(0, 5).join(', ');
    const extra = itemNames.length > 5 ? ` and ${itemNames.length - 5} more` : '';
    super(
      'A wardrobe preset references one or more items no longer in the user inventory.',
      `This preset needs items you no longer own: ${names}${extra}. Cancel their marketplace listings or reacquire them, then try again.`,
    );
    this.name = 'WardrobePresetItemsUnavailableError';
  }
}

export class WardrobePresetLimitError extends ExpectedDomainError {
  public constructor() {
    super(
      'The user has reached the wardrobe preset limit.',
      'You can save up to 20 outfit presets.',
    );
    this.name = 'WardrobePresetLimitError';
  }
}

export class WardrobePresetInvalidIdError extends ExpectedDomainError {
  public constructor() {
    super(
      'The wardrobe preset identifier is invalid.',
      'Enter a preset ID shown by /wardrobe preset list.',
    );
    this.name = 'WardrobePresetInvalidIdError';
  }
}
