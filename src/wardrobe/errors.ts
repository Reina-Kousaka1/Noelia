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
