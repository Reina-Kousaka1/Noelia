import type { BalletWeeklyStudioCard } from '../../ballet/studio-v22/types.js';
import { sectionName } from '../../ballet/class/curriculum.js';

export function renderWeeklyStudioCard(card: BalletWeeklyStudioCard): string {
  const lines = [
    '**Weekly Studio Card**',
    `Preparation: ${formatProgress(card.preparation.completed, card.preparation.target)} · ${card.preparation.remaining ?? '—'} remaining${card.preparation.timeRemainingMs === null ? '' : ` · ${formatDuration(card.preparation.timeRemainingMs)} left`}`,
    `Stamina: ${card.consistencyStamina}/150 · Readiness: ${card.readiness.state.toLowerCase().replaceAll('_', ' ')} (${signed(card.readiness.conditionModifier)})`,
    `Madame’s mood: ${card.mood.toLowerCase()}${card.patience === null ? '' : ` · Patience ${card.patience.current}/${card.patience.maximum}`}`,
  ];
  if (card.correctiveTasks.length > 0) {
    lines.push(
      'Corrective task: ' +
        card.correctiveTasks
          .map(
            (task) =>
              sectionName(task.targetSection) +
              ' success by <t:' +
              Math.floor(task.dueAt.getTime() / 1_000) +
              ':R>',
          )
          .join(' · '),
    );
  }
  if (card.pendingFollowup !== null) {
    lines.push(
      `Madame’s follow-up: +${card.pendingFollowup.extraWorkload} workload in a suitable preparation period before <t:${Math.floor(card.pendingFollowup.expiresAt.getTime() / 1_000)}:R>.`,
    );
  }
  if (card.warnings.length > 0) {
    lines.push(
      'Studio notes: ' +
        card.warnings.map((warning) => warning.replaceAll('_', ' ').toLowerCase()).join(' · ') +
        '.',
    );
  }
  return lines.join('\n');
}

function formatProgress(completed: number | null, target: number | null): string {
  return completed === null || target === null ? 'No active period' : `${completed}/${target}`;
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainingMinutes = minutes % 60;
  return (
    [
      days > 0 ? `${days}d` : '',
      hours > 0 ? `${hours}h` : '',
      remainingMinutes > 0 ? `${remainingMinutes}m` : '',
    ]
      .filter(Boolean)
      .join(' ') || 'under 1m'
  );
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
