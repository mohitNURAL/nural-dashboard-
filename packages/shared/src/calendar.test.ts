import { describe, expect, it } from 'vitest';
import { addWorkingHours, dayHours, workCalendar, workingDays, workingHours } from './calendar';

const cal = workCalendar({ holidays: [{ date: '2026-10-02', name: 'Gandhi Jayanti' }] });
// IST instants: "2026-10-05T09:30" local = 04:00Z.
const ist = (local: string) => new Date(`${local}+05:30`);

describe('working calendar (SRS 13.1)', () => {
  it('is Mon–Fri 09:30–18:30 IST, 9 hours a day', () => {
    expect(dayHours(cal)).toBe(9);
    // Monday 5 Oct, whole day.
    expect(workingHours(ist('2026-10-05T00:00'), ist('2026-10-06T00:00'), cal)).toBe(9);
    // Only the part inside the window counts.
    expect(workingHours(ist('2026-10-05T08:00'), ist('2026-10-05T10:30'), cal)).toBe(1);
    expect(workingHours(ist('2026-10-05T17:30'), ist('2026-10-05T23:00'), cal)).toBe(1);
  });

  it('skips weekends and holidays', () => {
    // Fri 9 Oct 18:00 → Mon 12 Oct 10:30: half an hour Friday, one hour Monday.
    expect(workingHours(ist('2026-10-09T18:00'), ist('2026-10-12T10:30'), cal)).toBe(1.5);
    // Thu 1 Oct → Mon 5 Oct: Thursday (9) + Fri 2 Oct holiday (0) + weekend (0).
    expect(workingHours(ist('2026-10-01T00:00'), ist('2026-10-05T00:00'), cal)).toBe(9);
    // A full week Mon–Mon = 45 hours.
    expect(workingHours(ist('2026-10-05T00:00'), ist('2026-10-12T00:00'), cal)).toBe(45);
    expect(workingDays(ist('2026-10-05T00:00'), ist('2026-10-12T00:00'), cal)).toBe(5);
  });

  it('counts long spans exactly (whole weeks plus edges, holidays out)', () => {
    // 2026 has 261 weekdays; this calendar's one holiday (Fri 2 Oct) is among them: 261 − 1.
    expect(workingHours(ist('2026-01-01T00:00'), ist('2027-01-01T00:00'), cal)).toBe(260 * 9);
    // Matches a day-by-day count for an odd span.
    const from = ist('2025-03-07T11:15');
    const to = ist('2026-10-14T16:40');
    let hours = 0;
    for (let t = from.getTime(); t < to.getTime(); t += 15 * 60_000) {
      hours += workingHours(new Date(t), new Date(Math.min(t + 15 * 60_000, to.getTime())), cal);
    }
    expect(workingHours(from, to, cal)).toBeCloseTo(hours, 6);
  });

  it('is 0 for an empty or reversed span', () => {
    expect(workingHours(ist('2026-10-05T12:00'), ist('2026-10-05T12:00'), cal)).toBe(0);
    expect(workingHours(ist('2026-10-06T12:00'), ist('2026-10-05T12:00'), cal)).toBe(0);
  });

  it('adds working hours across nights, weekends and holidays', () => {
    // Fri 9 Oct 17:30 + 2 h = 1 h Friday, 1 h Monday → Mon 12 Oct 10:30.
    expect(addWorkingHours(ist('2026-10-09T17:30'), 2, cal)).toEqual(ist('2026-10-12T10:30'));
    // Thu 1 Oct 18:30 + 1 h skips the holiday and weekend → Mon 5 Oct 10:30.
    expect(addWorkingHours(ist('2026-10-01T18:30'), 1, cal)).toEqual(ist('2026-10-05T10:30'));
    // From before opening: starts at 09:30.
    expect(addWorkingHours(ist('2026-10-05T07:00'), 9, cal)).toEqual(ist('2026-10-05T18:30'));
  });
});
