import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class MarketplaceListingNotFoundError extends ExpectedDomainError {
  public constructor() {
    super('Marketplace listing does not exist.', 'That listing could not be found.');
    this.name = 'MarketplaceListingNotFoundError';
  }
}

export class MarketplaceListingUnavailableError extends ExpectedDomainError {
  public constructor() {
    super('Marketplace listing is not active.', 'That listing is no longer available.');
    this.name = 'MarketplaceListingUnavailableError';
  }
}

export class MarketplaceNotSellerError extends ExpectedDomainError {
  public constructor() {
    super('Only the listing seller can cancel it.', 'Only the seller can cancel this listing.');
    this.name = 'MarketplaceNotSellerError';
  }
}

export class MarketplaceSelfPurchaseError extends ExpectedDomainError {
  public constructor() {
    super('A seller attempted to purchase their own listing.', 'You cannot buy your own listing.');
    this.name = 'MarketplaceSelfPurchaseError';
  }
}

export class MarketplaceItemNotOwnedError extends ExpectedDomainError {
  public constructor() {
    super(
      'A listing was created without sufficient available inventory.',
      'You do not have enough of that item available to list.',
    );
    this.name = 'MarketplaceItemNotOwnedError';
  }
}

export class MarketplaceItemEquippedError extends ExpectedDomainError {
  public constructor() {
    super(
      'An equipped item was offered to the marketplace.',
      'Unequip that item before listing it.',
    );
    this.name = 'MarketplaceItemEquippedError';
  }
}

export class MarketplaceQuantityError extends ExpectedDomainError {
  public constructor() {
    super(
      'The marketplace quantity is invalid for the selected item.',
      'Choose a valid quantity for that item.',
    );
    this.name = 'MarketplaceQuantityError';
  }
}

export class MarketplacePriceError extends ExpectedDomainError {
  public constructor() {
    super(
      'The marketplace price is outside the supported range.',
      'Choose a price between 1 and 9,223,372,036,854,775,807 Ballet Slippers.',
    );
    this.name = 'MarketplacePriceError';
  }
}

export class MarketplaceBuyerOwnsUniqueItemError extends ExpectedDomainError {
  public constructor() {
    super('The buyer already owns this non-stackable item.', 'You already own that unique item.');
    this.name = 'MarketplaceBuyerOwnsUniqueItemError';
  }
}

export class MarketplacePageError extends ExpectedDomainError {
  public constructor() {
    super('The requested marketplace page is invalid.', 'Choose a page from 1 to 100,000.');
    this.name = 'MarketplacePageError';
  }
}
