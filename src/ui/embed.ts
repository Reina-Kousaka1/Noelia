import type { EmbedOptions } from 'eris';

import { NOELIA_COPY } from '../persona/copy.js';
import { NOELIA_THEME } from './theme.js';
import type { EmbedTone } from './theme.js';

const toneColors: Readonly<Record<EmbedTone, number>> = {
  signature: NOELIA_THEME.colors.balletPink,
  success: NOELIA_THEME.colors.success,
  warning: NOELIA_THEME.colors.warning,
};

export interface NoeliaEmbedInput {
  readonly title: string;
  readonly description?: string;
  readonly fields?: readonly NonNullable<EmbedOptions['fields']>[number][];
  readonly tone?: EmbedTone;
}

export function createNoeliaEmbed(input: NoeliaEmbedInput): EmbedOptions {
  return {
    title: input.title,
    color: toneColors[input.tone ?? 'signature'],
    footer: { text: NOELIA_COPY.embedFooter },
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.fields === undefined ? {} : { fields: [...input.fields] }),
  };
}
