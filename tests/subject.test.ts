/**
 * Subject resolution: which saint a day gets, and which days take none.
 *
 * The pipeline offers the day's own saint first, then a coinciding optional
 * memorial, then the liturgical day itself. A martyrology tier would sit
 * between the last two, on days that admit a saint at all.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { LiturgicalCalendar } from '../src/calendar/adapter.js';
import { LOWEST_PRIVILEGED_TABLE_RANK } from '../src/config.js';
import { dateRange } from '../src/dates.js';
import { resolveSubject } from '../src/emit/subject.js';

let calendar: LiturgicalCalendar;
beforeAll(() => {
  calendar = new LiturgicalCalendar();
});

const subjectFor = async (date: string) => resolveSubject(await calendar.day(date));

describe('where the subject comes from', () => {
  it('takes the day’s own celebration when it is a saint', async () => {
    // USCCB 2026 calendar, 3 September: Saint Gregory the Great, Memorial.
    const s = await subjectFor('2026-09-03');
    expect(s.source).toBe('proper');
    expect(s.isFallback).toBe(false);
    expect(s.isSanctoral).toBe(true);
  });

  it('reaches for a coinciding optional memorial on a ferial day', async () => {
    // 5 September 2026 is a ferial Saturday carrying the optional memorial of
    // Saint Teresa of Calcutta.
    const s = await subjectFor('2026-09-05');
    expect(s.source).toBe('optional');
    expect(s.isFallback).toBe(true);
    expect(s.isSanctoral).toBe(true);
    expect(s.name).toContain('Teresa');
  });

  it('falls back to the liturgical day when no saint is available', async () => {
    const s = await subjectFor('2026-09-06'); // a Sunday in Ordinary Time
    expect(s.source).toBe('temporal');
    expect(s.isSanctoral).toBe(false);
  });
});

describe('which days admit a saint of their own', () => {
  it('closes the Triduum, the solemnities and the privileged Sundays', async () => {
    for (const date of [
      '2026-04-03', // Good Friday
      '2026-04-05', // Easter Sunday
      '2026-12-25', // Christmas
      '2026-01-06', // Epiphany
      '2026-02-18', // Ash Wednesday
      '2026-03-15', // a Sunday of Lent
      '2026-04-06', // Monday within the Octave of Easter
      '2026-01-11', // the Baptism of the Lord, a feast of the Lord
    ]) {
      const s = await subjectFor(date);
      expect(s.admitsSaint, `${date} should admit no other saint`).toBe(false);
    }
  });

  it('leaves ordinary days open', async () => {
    for (const date of [
      '2026-01-12', // a ferial weekday
      '2026-01-18', // a Sunday in Ordinary Time
      '2026-09-03', // a memorial
      '2026-02-20', // a Friday of Lent, which does admit a commemoration
    ]) {
      const s = await subjectFor(date);
      expect(s.admitsSaint, `${date} should admit a saint`).toBe(true);
    }
  });

  it('never reaches for an optional memorial on a privileged day', async () => {
    // The rule and romcal agree, but the pipeline must not depend on romcal
    // for it: a privileged day keeps its own celebration whatever coincides.
    for (const date of dateRange('2027-01-01', '2027-12-31')) {
      const day = await calendar.day(date);
      const subject = resolveSubject(day);
      if (day.tableRank <= LOWEST_PRIVILEGED_TABLE_RANK) {
        expect(subject.source, `${date}`).not.toBe('optional');
      }
    }
  });

  it('closes exactly the privileged days across a whole year', async () => {
    let closed = 0;
    for (const date of dateRange('2027-01-01', '2027-12-31')) {
      const day = await calendar.day(date);
      const admits = resolveSubject(day).admitsSaint;
      expect(admits).toBe(day.tableRank > LOWEST_PRIVILEGED_TABLE_RANK);
      if (!admits) closed += 1;
    }
    // Sanity on the size of the set: roughly the solemnities, the Triduum, the
    // Easter octave and the Sundays of Advent, Lent and Easter.
    expect(closed).toBeGreaterThan(40);
    expect(closed).toBeLessThan(80);
  });
});

describe('every day still yields a subject', () => {
  it('resolves a named subject for a full year', async () => {
    for (const date of dateRange('2027-01-01', '2027-12-31')) {
      const s = await subjectFor(date);
      expect(s.id).not.toBe('');
      expect(s.name).not.toBe('');
      expect(['proper', 'optional', 'temporal']).toContain(s.source);
      // is_fallback stays exactly "not the day's own saint".
      expect(s.isFallback).toBe(s.source !== 'proper');
    }
  });
});
