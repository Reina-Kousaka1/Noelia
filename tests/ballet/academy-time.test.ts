import { describe, expect, it } from 'vitest';

import {
  AcademyLocalTimeError,
  resolveAcademyClassTime,
  validateAcademyScheduleHorizon,
} from '../../src/ballet/academy-time.js';

describe('Academy local class time', () => {
  it('resolves a valid local time to UTC without losing the timezone meaning', () => {
    expect(
      resolveAcademyClassTime({
        date: '2026-10-05',
        time: '15:00',
        timeZone: 'Europe/Berlin',
      }).toISOString(),
    ).toBe('2026-10-05T13:00:00.000Z');
  });

  it('rejects nonexistent and ambiguous daylight-saving wall times', () => {
    expect(() =>
      resolveAcademyClassTime({
        date: '2026-03-29',
        time: '02:30',
        timeZone: 'Europe/Berlin',
      }),
    ).toThrow(AcademyLocalTimeError);
    expect(() =>
      resolveAcademyClassTime({
        date: '2026-10-25',
        time: '02:30',
        timeZone: 'Europe/Berlin',
      }),
    ).toThrow(/occurs twice/);
  });

  it('validates the scheduling horizon against an injected clock', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    expect(() => validateAcademyScheduleHorizon(new Date('2026-10-05T10:29:59Z'), now)).toThrow(
      AcademyLocalTimeError,
    );
    expect(() =>
      validateAcademyScheduleHorizon(new Date('2026-10-05T10:30:00Z'), now),
    ).not.toThrow();
    expect(() => validateAcademyScheduleHorizon(new Date('2027-01-10T10:00:00Z'), now)).toThrow(
      AcademyLocalTimeError,
    );
  });
});
