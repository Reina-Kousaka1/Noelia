import { describe, expect, it } from 'vitest';

import {
  createRelationshipProposalButtons,
  parseRelationshipButtonId,
} from '../../src/relationships/components.js';

describe('relationship proposal components', () => {
  it('builds accept, decline, and proposer-cancel actions for one proposal', () => {
    expect(createRelationshipProposalButtons('57')[0]?.components).toEqual([
      expect.objectContaining({ custom_id: 'noelia:marriage:accept:57' }),
      expect.objectContaining({ custom_id: 'noelia:marriage:decline:57' }),
      expect.objectContaining({ custom_id: 'noelia:marriage:cancel:57' }),
    ]);
  });

  it('parses only recognized action IDs with a positive numeric proposal ID', () => {
    expect(parseRelationshipButtonId('noelia:marriage:accept:57')).toEqual({
      action: 'accept',
      proposalId: '57',
    });
    expect(parseRelationshipButtonId('noelia:marriage:cancel:0')).toBeNull();
    expect(parseRelationshipButtonId('noelia:marriage:remove:57')).toBeNull();
    expect(parseRelationshipButtonId('noelia:marriage:accept:57:extra')).toBeNull();
  });
});
