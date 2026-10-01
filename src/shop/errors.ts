import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class ShopItemUnavailableError extends ExpectedDomainError {
  public constructor() {
    super(
      'The requested shop item is missing, inactive, or not purchasable.',
      'That item is not currently available to purchase.',
    );
    this.name = 'ShopItemUnavailableError';
  }
}

export class ShopPurchaseQuantityError extends ExpectedDomainError {
  public constructor() {
    super('The requested shop quantity is invalid.', 'Choose a quantity from 1 to 99,999.');
    this.name = 'ShopPurchaseQuantityError';
  }
}

export class ShopLevelRequirementError extends ExpectedDomainError {
  public constructor(public readonly requiredLevel: number) {
    super(
      `The shop item requires Ballet level ${requiredLevel}.`,
      `That item unlocks at Ballet level ${requiredLevel}.`,
    );
    this.name = 'ShopLevelRequirementError';
  }
}

export class ShopItemAlreadyOwnedError extends ExpectedDomainError {
  public constructor() {
    super('The user already owns this non-stackable item.', 'You already own this item.');
    this.name = 'ShopItemAlreadyOwnedError';
  }
}

export class InventoryQuantityLimitError extends ExpectedDomainError {
  public constructor() {
    super(
      'The purchase would exceed the maximum allowed inventory stack.',
      'That purchase would exceed the maximum stack size for this item.',
    );
    this.name = 'InventoryQuantityLimitError';
  }
}

export class ShopPriceLimitError extends ExpectedDomainError {
  public constructor() {
    super(
      'The purchase total exceeds the supported Ballet Slippers amount.',
      'The total price exceeds the supported Ballet Slippers limit.',
    );
    this.name = 'ShopPriceLimitError';
  }
}
