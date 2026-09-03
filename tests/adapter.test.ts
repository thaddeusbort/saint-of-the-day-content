/**
 * Adapter correctness.
 *
 * These tests check the mapping from romcal's vocabulary onto the published
 * contract — not romcal's internals. But a mapping bug and a calendar bug look
 * identical from outside, so every expected value below comes from a published
 * liturgical calendar, cited inline, and never from this pipeline's own output.
 *
 * Sources:
 *  - Liturgical Calendar for the Dioceses of the United States of America 2026,
 *    USCCB. https://www.usccb.org/resources/2026cal.pdf
 *  - Universal Norms on the Liturgical Year and the Calendar (UNLY), nn. 5, 16,
 *    19, 56, 59-60, and the Table of Liturgical Days.
 *  - Catholic Culture liturgical calendar, day pages cited per test.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { LiturgicalCalendar, __testing } from '../src/calendar/adapter.js';
import type { LiturgicalDay } from '../src/calendar/types.js';

let calendar: LiturgicalCalendar;
beforeAll(() => {
  calendar = new LiturgicalCalendar();
});

const day = (date: string): Promise<LiturgicalDay> => calendar.day(date);

describe('an ordinary memorial', () => {
  it('maps St John Bosco, 31 January 2026', async () => {
    // USCCB 2026 calendar, 31 January: "Saint John Bosco, Priest", Memorial,
    // white, in Ordinary Time.
    const d = await day('2026-01-31');
    expect(d.rank).toBe('memorial');
    expect(d.color).toBe('white');
    expect(d.season).toBe('ordinary');
    expect(d.celebrations[0]?.name).toContain('John Bosco');
    expect(d.celebrations[0]?.isSanctoral).toBe(true);
  });
});

describe('a ferial day', () => {
  it('maps Monday of the first week of Ordinary Time, 12 January 2026', async () => {
    // USCCB 2026 calendar: the weekday after the Baptism of the Lord
    // (11 January 2026) is a ferial weekday of Ordinary Time, green. The
    // General Roman Calendar has no saint on 12 January.
    const d = await day('2026-01-12');
    expect(d.rank).toBe('weekday');
    expect(d.color).toBe('green');
    expect(d.season).toBe('ordinary');
    expect(d.celebrations.every((c) => !c.isSanctoral)).toBe(true);
  });
});

describe('a Sunday', () => {
  it('maps the Second Sunday in Ordinary Time, 18 January 2026', async () => {
    const d = await day('2026-01-18');
    expect(d.rank).toBe('sunday');
    expect(d.color).toBe('green');
    expect(d.season).toBe('ordinary');
  });

  it('gives Laetare Sunday rose, 15 March 2026', async () => {
    // UNLY / GIRM n. 346f: rose may be used on Laetare Sunday, the Fourth
    // Sunday of Lent. Lent 2026 begins on Ash Wednesday, 18 February
    // (USCCB 2026 calendar), putting Lent IV on 15 March.
    const d = await day('2026-03-15');
    expect(d.rank).toBe('sunday');
    expect(d.season).toBe('lent');
    expect(d.color).toBe('rose');
  });
});

describe('a solemnity', () => {
  it('maps Christmas, 25 December 2026', async () => {
    const d = await day('2026-12-25');
    expect(d.rank).toBe('solemnity');
    expect(d.color).toBe('white');
    expect(d.season).toBe('christmas');
  });

  it('places Easter Sunday in Easter Time, 5 April 2026', async () => {
    // USCCB 2026 calendar: Easter Sunday is 5 April 2026, and Easter Time runs
    // from 5 April to 24 May. The Triduum ends with Evening Prayer on Easter
    // Sunday (UNLY n. 19), so romcal reports both seasons; the published label
    // follows the calendar.
    const d = await day('2026-04-05');
    expect(d.rank).toBe('solemnity');
    expect(d.color).toBe('white');
    expect(d.season).toBe('easter');
  });

  it('keeps Good Friday in the Triduum and in red, 3 April 2026', async () => {
    // UNLY n. 19; the Friday of the Passion of the Lord is kept in red.
    const d = await day('2026-04-03');
    expect(d.season).toBe('triduum');
    expect(d.color).toBe('red');
  });
});

describe('coinciding celebrations', () => {
  it('lists all three celebrations on 20 January 2026', async () => {
    // USCCB 2026 calendar, 20 January: a weekday of Ordinary Time with two
    // optional memorials — Saint Fabian, Pope and Martyr, and Saint Sebastian,
    // Martyr.
    const d = await day('2026-01-20');
    const names = d.celebrations.map((c) => c.name);
    expect(names).toHaveLength(3);
    expect(names[0]).toContain('Ordinary Time');
    expect(names.join(' | ')).toContain('Fabian');
    expect(names.join(' | ')).toContain('Sebastian');
    // The day itself is ferial; the memorials are optional.
    expect(d.rank).toBe('weekday');
    expect(d.celebrations.slice(1).every((c) => c.isOptional)).toBe(true);
  });
});

describe('transferred solemnities', () => {
  it('moves Saint Joseph off the Fourth Sunday of Lent in 2023', async () => {
    // 19 March 2023 fell on the Fourth Sunday of Lent. Sundays of Lent outrank
    // solemnities (UNLY Table of Liturgical Days, I.2 over I.3), so the
    // solemnity was transferred to Monday 20 March 2023.
    // https://www.catholicculture.org/culture/liturgicalyear/calendar/day.cfm?date=2023-03-20
    const impeded = await day('2023-03-19');
    expect(impeded.rank).toBe('sunday');
    expect(impeded.season).toBe('lent');
    expect(impeded.celebrations[0]?.name).toContain('fourth Sunday of Lent');

    const transferred = await day('2023-03-20');
    expect(transferred.rank).toBe('solemnity');
    expect(transferred.color).toBe('white');
    expect(transferred.celebrations[0]?.name).toContain('Joseph');
    expect(transferred.celebrations[0]?.isSanctoral).toBe(true);
  });

  it('moves the Annunciation out of Holy Week in 2024', async () => {
    // 25 March 2024 fell on Monday of Holy Week. The Roman Missal directs that
    // when this solemnity occurs during Holy Week it is transferred to the
    // Monday after the Second Sunday of Easter — 8 April 2024.
    // https://adoremus.org/2024/03/looking-ahead-to-the-annunciation-march-25-but-transferred-to-april-8-in-2024/
    const impeded = await day('2024-03-25');
    expect(impeded.season).toBe('lent');
    expect(impeded.celebrations[0]?.name).toContain('Holy Week');
    expect(impeded.celebrations.some((c) => c.name.includes('Annunciation'))).toBe(false);

    const transferred = await day('2024-04-08');
    expect(transferred.rank).toBe('solemnity');
    expect(transferred.season).toBe('easter');
    expect(transferred.color).toBe('white');
    expect(transferred.celebrations[0]?.name).toContain('Annunciation');
  });

  it('leaves Saint Joseph on 19 March in a year with no collision', async () => {
    // 19 March 2026 is a Thursday of Lent, so the solemnity is kept on the day.
    // USCCB 2026 calendar, 19 March: Saint Joseph, Spouse of the Blessed
    // Virgin Mary, Solemnity.
    const d = await day('2026-03-19');
    expect(d.rank).toBe('solemnity');
    expect(d.celebrations[0]?.name).toContain('Joseph');
  });
});

describe('the Table of Liturgical Days', () => {
  // UNLY nn. 59-61 orders the days 1 to 13. romcal names each precedence after
  // its place in that table, and the adapter reads the rank back out of the
  // name — so this checks the parse against the whole vocabulary rather than
  // against a handful of dates.
  it('reads a rank in 1..13 out of every precedence romcal defines', async () => {
    const { Romcal } = await import('romcal');
    const precedences = Romcal.PRECEDENCES as string[];
    expect(precedences.length).toBeGreaterThan(20);
    for (const precedence of precedences) {
      const rank = __testing.toTableRank(precedence);
      expect(Number.isInteger(rank)).toBe(true);
      expect(rank).toBeGreaterThanOrEqual(1);
      expect(rank).toBeLessThanOrEqual(13);
    }
  });

  it('refuses a precedence with no rank in its name', () => {
    expect(() => __testing.toTableRank('SOMETHING_NEW')).toThrow(/Unmapped romcal precedence/);
    expect(() => __testing.toTableRank(undefined)).toThrow(/Unmapped romcal precedence/);
  });

  it('ranks the days the Table ranks', async () => {
    // Triduum is I.1; solemnities of the Lord in Ordinary Time are I.3;
    // a Sunday in Ordinary Time is II.6; a ferial weekday is IV.13.
    expect((await day('2026-04-03')).tableRank).toBe(1); // Good Friday
    expect((await day('2026-12-25')).tableRank).toBe(2); // Christmas
    expect((await day('2026-03-15')).tableRank).toBe(2); // a Sunday of Lent
    expect((await day('2026-01-18')).tableRank).toBe(6); // a Sunday in Ordinary Time
    expect((await day('2026-01-31')).tableRank).toBe(10); // St John Bosco, a memorial
    expect((await day('2026-01-12')).tableRank).toBe(13); // a ferial weekday
  });
});

describe('vocabulary', () => {
  it('maps every day of a full year without an unmapped value', async () => {
    // The adapter throws on an unmapped season, colour or rank, so a romcal
    // upgrade that introduces one fails here rather than publishing blanks.
    const seasons = new Set<string>();
    const colors = new Set<string>();
    const ranks = new Set<string>();
    for (let offset = 0; offset < 365; offset += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
      const d = await day(date);
      seasons.add(d.season);
      colors.add(d.color);
      ranks.add(d.rank);
    }
    expect([...seasons].sort()).toEqual([
      'advent',
      'christmas',
      'easter',
      'lent',
      'ordinary',
      'triduum',
    ]);
    expect([...colors].sort()).toEqual(['green', 'red', 'rose', 'violet', 'white']);
    expect([...ranks].sort()).toEqual(['feast', 'memorial', 'solemnity', 'sunday', 'weekday']);
  });
});
