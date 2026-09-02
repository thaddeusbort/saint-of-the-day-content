/** Date arithmetic, serialisation and worklist rendering. */

import { describe, expect, it } from 'vitest';
import { addDays, dateRange, daysBetween, isIsoDate, parseIsoDate } from '../src/dates.js';
import { stringify } from '../src/json.js';
import { renderWorklist, WORKLIST_HORIZON_DAYS, type WorklistItem } from '../src/worklist.js';
import { toContentId } from '../src/calendar/adapter.js';

describe('date arithmetic', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('measures whole days in either direction', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7);
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7);
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('builds an inclusive, contiguous range', () => {
    const range = dateRange('2026-08-25', '2026-09-01');
    expect(range).toHaveLength(8);
    expect(range[0]).toBe('2026-08-25');
    expect(range.at(-1)).toBe('2026-09-01');
    for (let i = 1; i < range.length; i += 1) {
      expect(daysBetween(range[i - 1] as string, range[i] as string)).toBe(1);
    }
  });

  it('spans a leap year without dropping or duplicating a day', () => {
    // 2028 is a leap year: 2027-12-25 + 400 days lands on 2029-01-28.
    const range = dateRange('2027-12-25', '2029-01-28');
    expect(new Set(range).size).toBe(range.length);
    expect(range).toContain('2028-02-29');
  });

  it('rejects a value that is not a yyyy-MM-dd date', () => {
    expect(isIsoDate('2026-9-1')).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('not a date')).toBe(false);
    expect(() => parseIsoDate('2026-13-01')).toThrow();
  });
});

describe('serialisation', () => {
  it('is stable and ends with a newline', () => {
    const value = { b: 1, a: [1, 2] };
    expect(stringify(value)).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}\n');
    expect(stringify(value)).toBe(stringify(structuredClone(value)));
  });
});

describe('content ids', () => {
  it('hyphenates romcal ids', () => {
    expect(toContentId('john_bosco_priest')).toBe('john-bosco-priest');
    expect(toContentId('ordinary_time_22_tuesday')).toBe('ordinary-time-22-tuesday');
  });
});

describe('the worklist', () => {
  const item = (date: string, id: string, isSanctoral = true): WorklistItem => ({
    date,
    subject: { id, name: `Subject ${id}`, isFallback: true, isSanctoral },
    rank: 'memorial',
    color: 'white',
  });

  it('sorts by how soon the day arrives', () => {
    const md = renderWorklist('2026-09-01', [
      item('2026-10-01', 'later'),
      item('2026-09-02', 'sooner'),
      item('2026-09-15', 'middle'),
    ]);
    expect(md.indexOf('`sooner`')).toBeLessThan(md.indexOf('`middle`'));
    expect(md.indexOf('`middle`')).toBeLessThan(md.indexOf('`later`'));
  });

  it('drops days already past and days beyond the horizon', () => {
    const md = renderWorklist('2026-09-01', [
      item('2026-08-30', 'past'),
      item(addDays('2026-09-01', WORKLIST_HORIZON_DAYS + 1), 'far'),
      item('2026-09-02', 'kept'),
    ]);
    expect(md).not.toContain('`past`');
    expect(md).not.toContain('`far`');
    expect(md).toContain('`kept`');
  });

  it('groups repeated subjects into one job, keeping the soonest date', () => {
    const md = renderWorklist('2026-09-01', [
      item('2026-09-10', 'repeat'),
      item('2026-09-20', 'repeat'),
    ]);
    expect(md.match(/`repeat`/g)).toHaveLength(1);
    expect(md).toContain('2026-09-10 (+1)');
  });

  it('distinguishes a saint from a temporal day', () => {
    const md = renderWorklist('2026-09-01', [
      item('2026-09-02', 'a-saint', true),
      item('2026-09-03', 'a-sunday', false),
    ]);
    expect(md).toMatch(/\| saint \| `a-saint`/);
    expect(md).toMatch(/\| day \| `a-sunday`/);
  });

  it('says so plainly when there is nothing outstanding', () => {
    expect(renderWorklist('2026-09-01', [])).toContain('Nothing outstanding');
  });

  it('renders identically for identical input', () => {
    const items = [item('2026-09-02', 'a'), item('2026-09-03', 'b')];
    expect(renderWorklist('2026-09-01', items)).toBe(renderWorklist('2026-09-01', [...items]));
  });

  it('escapes a pipe so one subject cannot break the table', () => {
    const md = renderWorklist('2026-09-01', [
      {
        date: '2026-09-02',
        subject: { id: 'x', name: 'A | B', isFallback: true, isSanctoral: true },
        rank: 'memorial',
        color: 'white',
      },
    ]);
    expect(md).toContain('A \\| B');
  });
});
