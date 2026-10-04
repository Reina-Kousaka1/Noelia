export interface LocalAcademyClassTime {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
}

export class AcademyLocalTimeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AcademyLocalTimeError';
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Resolve a local wall-clock time to one unambiguous UTC instant. */
export function resolveAcademyClassTime(input: LocalAcademyClassTime): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(input.time);
  if (dateMatch === null || timeMatch === null) {
    throw new AcademyLocalTimeError(
      'Use date YYYY-MM-DD and time HH:MM in your selected timezone.',
    );
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  const wallClock = new Date(wallClockUtc);
  if (
    wallClock.getUTCFullYear() !== year ||
    wallClock.getUTCMonth() + 1 !== month ||
    wallClock.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    throw new AcademyLocalTimeError('That local date or time is not valid.');
  }

  const formatter = getFormatter(input.timeZone);
  const candidates = new Set<number>();
  // Check offsets across the surrounding day so both sides of a DST fold are
  // considered. Nonexistent spring-forward wall times produce no candidate.
  for (let delta = -36; delta <= 36; delta += 1) {
    const sample = wallClockUtc + delta * 60 * 60 * 1_000;
    const offset = localEpoch(formatter, sample) - sample;
    const candidate = wallClockUtc - offset;
    if (sameLocalMinute(formatter, candidate, year, month, day, hour, minute)) {
      candidates.add(candidate);
    }
  }

  if (candidates.size === 0) {
    throw new AcademyLocalTimeError(
      'That local time does not exist because the clocks change. Choose another time.',
    );
  }
  if (candidates.size > 1) {
    throw new AcademyLocalTimeError(
      'That local time occurs twice because the clocks change. Choose a different time.',
    );
  }
  return new Date([...candidates][0]!);
}

export function validateAcademyScheduleHorizon(
  scheduledAt: Date,
  now: Date,
  minimumLeadMs = 30 * 60 * 1_000,
  maximumLeadMs = 90 * 24 * 60 * 60 * 1_000,
): void {
  const lead = scheduledAt.getTime() - now.getTime();
  if (!Number.isFinite(lead) || lead < minimumLeadMs || lead > maximumLeadMs) {
    throw new AcademyLocalTimeError(
      'Choose a class time at least 30 minutes from now and within the next 90 days.',
    );
  }
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    throw new AcademyLocalTimeError('Use a valid IANA timezone, such as Europe/Berlin.');
  }
}

function localEpoch(formatter: Intl.DateTimeFormat, timestamp: number): number {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
}

function sameLocalMinute(
  formatter: Intl.DateTimeFormat,
  timestamp: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): boolean {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  return (
    Number(parts.year) === year &&
    Number(parts.month) === month &&
    Number(parts.day) === day &&
    Number(parts.hour) === hour &&
    Number(parts.minute) === minute
  );
}
