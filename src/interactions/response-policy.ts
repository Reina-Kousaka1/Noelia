import * as Eris from 'eris';

export type InteractionVisibility = 'public' | 'ephemeral';

const ephemeralFlag = Eris.Constants.MessageFlags.EPHEMERAL;

/** Normal gameplay is public unless a caller explicitly asks for private visibility. */
export async function deferCommand(
  interaction: Eris.CommandInteraction,
  visibility: InteractionVisibility = 'public',
): Promise<void> {
  if (visibility === 'ephemeral') {
    await interaction.defer(ephemeralFlag);
    return;
  }

  await interaction.defer();
}

/** Completes a deferred public reply, keeping it visible and persistent in the channel. */
export async function completeCommand(
  interaction: Eris.CommandInteraction,
  response: string | Eris.InteractionContentEdit,
): Promise<void> {
  if (interaction.acknowledged) {
    await interaction.editOriginalMessage(response);
    return;
  }

  await interaction.createMessage(response);
}

/** Keeps expected and unexpected command errors private, even after a public defer. */
export async function respondPrivately(
  interaction: Eris.CommandInteraction,
  content: string,
): Promise<void> {
  const response = { content, flags: ephemeralFlag };
  if (!interaction.acknowledged) {
    await interaction.createMessage(response);
    return;
  }

  // A public defer creates a temporary loading response. Remove it before the private error.
  try {
    await interaction.deleteOriginalMessage();
  } catch {
    // Still deliver the private error if the loading response was already removed.
  }
  await interaction.createFollowup(response);
}

/** Component failures are private followups; never delete the public proposal message. */
export async function respondPrivatelyToComponent(
  interaction: Eris.ComponentInteraction,
  content: string,
): Promise<void> {
  const response = { content, flags: ephemeralFlag };
  if (interaction.acknowledged) {
    await interaction.createFollowup(response);
    return;
  }

  await interaction.createMessage(response);
}
