import * as Eris from 'eris';

import { NOELIA_COPY } from '../persona/copy.js';

export type RelationshipButtonAction = 'accept' | 'decline' | 'cancel';

export function createRelationshipProposalButtons(proposalId: string): Eris.ActionRow[] {
  return [
    {
      type: Eris.Constants.ComponentTypes.ACTION_ROW,
      components: [
        {
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: Eris.Constants.ButtonStyles.SUCCESS,
          custom_id: relationshipButtonId('accept', proposalId),
          label: NOELIA_COPY.marriageAcceptButton,
        },
        {
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: Eris.Constants.ButtonStyles.SECONDARY,
          custom_id: relationshipButtonId('decline', proposalId),
          label: NOELIA_COPY.marriageDeclineButton,
        },
        {
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: Eris.Constants.ButtonStyles.DANGER,
          custom_id: relationshipButtonId('cancel', proposalId),
          label: NOELIA_COPY.marriageCancelButton,
        },
      ],
    },
  ];
}

export function parseRelationshipButtonId(
  customId: string,
): { readonly action: RelationshipButtonAction; readonly proposalId: string } | null {
  const match = /^noelia:marriage:(accept|decline|cancel):([1-9][0-9]{0,18})$/.exec(customId);
  if (match === null) return null;
  const action = match[1];
  const proposalId = match[2];
  if (
    (action !== 'accept' && action !== 'decline' && action !== 'cancel') ||
    proposalId === undefined
  ) {
    return null;
  }
  return { action, proposalId };
}

function relationshipButtonId(action: RelationshipButtonAction, proposalId: string): string {
  return `noelia:marriage:${action}:${proposalId}`;
}
