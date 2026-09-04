/**
 * End-to-end properties of a run: determinism, windowing, contract conformance,
 * the fallback path, and idempotent rendering.
 */

import { access, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate, type GenerateSummary } from '../src/generate.js';
import { WINDOW_DAYS_AHEAD, WINDOW_DAYS_BEHIND, VARIANTS } from '../src/config.js';
import { addDays, dateRange } from '../src/dates.js';
import type { DayRecord } from '../src/emit/record.js';
import {
  addCuratedSaint,
  makeCheckout,
  snapshotDiff,
  snapshotEquals,
  snapshotTree,
} from './helpers.js';

/** A fixed "today" keeps every expectation in these tests stable over time. */
const TODAY = '2026-09-01';

async function readDay(root: string, date: string): Promise<DayRecord> {
  const file = path.join(root, 'docs', 'v1', date.slice(0, 4), `${date.slice(5)}.json`);
  return JSON.parse(await readFile(file, 'utf8')) as DayRecord;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

describe('a run with no curated saints', () => {
  let root: string;
  let summary: GenerateSummary;

  beforeAll(async () => {
    root = await makeCheckout();
    summary = await generate({ root, today: TODAY });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('covers [today - 7, today + 400] contiguously with no gaps', async () => {
    const expected = dateRange(
      addDays(TODAY, -WINDOW_DAYS_BEHIND),
      addDays(TODAY, WINDOW_DAYS_AHEAD),
    );
    expect(summary.days).toBe(expected.length);
    expect(expected.length).toBe(WINDOW_DAYS_BEHIND + WINDOW_DAYS_AHEAD + 1);

    const published: string[] = [];
    const apiDir = path.join(root, 'docs', 'v1');
    for (const year of (await readdir(apiDir)).filter((name) => /^\d{4}$/.test(name))) {
      for (const file of await readdir(path.join(apiDir, year))) {
        published.push(`${year}-${file.replace(/\.json$/, '')}`);
      }
    }
    expect(published.sort()).toEqual(expected);
  });

  it('serves a trailing margin, so a device behind UTC never asks for a missing day', async () => {
    // The app reads the device's local date. UTC-12 can ask for yesterday.
    expect(await exists(path.join(root, 'docs', 'v1', '2026', '08-25.json'))).toBe(true);
    expect(summary.start).toBe(addDays(TODAY, -WINDOW_DAYS_BEHIND));
  });

  it('gives every day a non-null saint and image with resolvable variants', async () => {
    const expected = dateRange(summary.start, summary.end);
    for (const date of expected) {
      const record = await readDay(root, date);
      expect(record.schema).toBe(1);
      expect(record.date).toBe(date);
      expect(record.saint).toBeTruthy();
      expect(record.saint.id).not.toBe('');
      expect(record.saint.name).not.toBe('');
      expect(typeof record.saint.is_fallback).toBe('boolean');
      expect(record.image).toBeTruthy();
      expect(record.image.variants.length).toBe(VARIANTS.length);
      expect(record.celebration).not.toBe('');
      expect(record.all_celebrations.length).toBeGreaterThan(0);

      for (const variant of record.image.variants) {
        // urls are relative to v1/, which is what the app joins them onto.
        expect(variant.url.startsWith('img/')).toBe(true);
        expect(await exists(path.join(root, 'docs', 'v1', variant.url))).toBe(true);
      }
    }
  });

  it('carries a notification line, derived where it can be', async () => {
    // 3 September 2026: Saint Gregory the Great, addressable, so a line comes
    // for free.
    const saint = await readDay(root, '2026-09-03');
    expect(saint.notification).toMatch(/, pray for us!$/);
    expect(saint.notification).toContain('Gregory');

    // A Sunday in Ordinary Time has no one to address; a curator supplies it.
    const sunday = await readDay(root, '2026-09-06');
    expect(sunday.notification).toBe('');

    // Christmas likewise: "The Nativity of the Lord, pray for us!" is wrong.
    const christmas = await readDay(root, '2026-12-25');
    expect(christmas.notification).toBe('');
  });

  it('emits a complete placeholder record for a day with no curated saint', async () => {
    const record = await readDay(root, '2026-09-03');
    // USCCB 2026 calendar, 3 September: Saint Gregory the Great, Pope and
    // Doctor of the Church, Memorial, white.
    expect(record.rank).toBe('memorial');
    expect(record.color).toBe('white');
    expect(record.saint.is_fallback).toBe(false);
    expect(record.image.is_placeholder).toBe(true);
    expect(record.image.variants[0]?.url).toBe('img/fallback-white-1440x3200.jpg');
    expect(record.image.license).not.toBe('');
    // Everything the app defaults to "" is allowed to be empty here.
    expect(record.saint.blurb).toBe('');
    expect(record.saint.years).toBe('');
  });

  it('marks is_fallback only when the day has no proper celebration of a saint', async () => {
    // 8 September: the Nativity of the Blessed Virgin Mary, a Feast — the
    // day's own celebration, so not a fallback.
    const proper = await readDay(root, '2026-09-08');
    expect(proper.rank).toBe('feast');
    expect(proper.saint.is_fallback).toBe(false);

    // 5 September: a ferial Saturday carrying the optional memorial of Saint
    // Teresa of Calcutta. A saint is available, but the day does not require
    // her, so the pipeline chose her.
    const optional = await readDay(root, '2026-09-05');
    expect(optional.rank).toBe('weekday');
    expect(optional.saint.is_fallback).toBe(true);
    expect(optional.saint.name).toContain('Teresa');

    // 6 September: a Sunday in Ordinary Time. Nothing sanctoral at all.
    const sunday = await readDay(root, '2026-09-06');
    expect(sunday.rank).toBe('sunday');
    expect(sunday.saint.is_fallback).toBe(true);
  });

  it('renders each colour plate once and only once', async () => {
    // Five plates, three variants each, rendered on the first run.
    expect(summary.imagesRendered).toBe(5 * VARIANTS.length);
    const images = await readdir(path.join(root, 'docs', 'v1', 'img'));
    expect(images.sort()).toHaveLength(5 * VARIANTS.length);
  });

  it('writes .nojekyll so Pages serves the tree verbatim', async () => {
    expect(await exists(path.join(root, 'docs', '.nojekyll'))).toBe(true);
  });

  it('produces a byte-identical tree when run again', async () => {
    const before = await snapshotTree(path.join(root, 'docs'));
    const worklistBefore = await readFile(path.join(root, 'WORKLIST.md'), 'utf8');

    const second = await generate({ root, today: TODAY });
    const after = await snapshotTree(path.join(root, 'docs'));

    expect(snapshotDiff(before, after)).toEqual([]);
    expect(snapshotEquals(before, after)).toBe(true);
    expect(await readFile(path.join(root, 'WORKLIST.md'), 'utf8')).toBe(worklistBefore);
    // Idempotent rendering: the second run writes no image at all.
    expect(second.imagesRendered).toBe(0);
  });
});

describe('windowing', () => {
  it('prunes days that fall out of the window as it advances', async () => {
    const root = await makeCheckout();
    try {
      await generate({ root, today: TODAY });
      const dropped = path.join(root, 'docs', 'v1', '2026', '08-25.json');
      expect(await exists(dropped)).toBe(true);

      // Move "today" on by three days: three days leave the trailing edge and
      // three arrive at the leading edge.
      const next = await generate({ root, today: addDays(TODAY, 3) });
      expect(next.daysPruned).toBe(3);
      expect(await exists(dropped)).toBe(false);
      expect(await exists(path.join(root, 'docs', 'v1', '2026', '08-28.json'))).toBe(true);
      expect(await exists(path.join(root, 'docs', 'v1', '2027', '10-09.json'))).toBe(true);

      // Still contiguous after pruning.
      const expected = dateRange(next.start, next.end);
      const published: string[] = [];
      const apiDir = path.join(root, 'docs', 'v1');
      for (const year of (await readdir(apiDir)).filter((name) => /^\d{4}$/.test(name))) {
        for (const file of await readdir(path.join(apiDir, year))) {
          published.push(`${year}-${file.replace(/\.json$/, '')}`);
        }
      }
      expect(published.sort()).toEqual(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes a stray published day from a year no longer in the window', async () => {
    const root = await makeCheckout();
    try {
      const strayDir = path.join(root, 'docs', 'v1', '2019');
      await mkdir(strayDir, { recursive: true });
      await writeFile(path.join(strayDir, '05-04.json'), '{}\n', 'utf8');

      await generate({ root, today: TODAY });
      expect(await exists(strayDir)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('a curated saint', () => {
  it('replaces the placeholder and renders its own variants exactly once', async () => {
    const root = await makeCheckout();
    try {
      await generate({ root, today: TODAY });
      const before = await readDay(root, '2026-09-03');
      expect(before.image.is_placeholder).toBe(true);

      // The subject id for 3 September 2026 (Saint Gregory the Great).
      await addCuratedSaint(root, before.saint.id);
      const curatedRun = await generate({ root, today: TODAY });

      const after = await readDay(root, '2026-09-03');
      expect(after.image.is_placeholder).toBe(false);
      expect(after.saint.name).toBe('St. Test of Somewhere');
      expect(after.saint.blurb).toBe('A curated blurb.');
      expect(after.saint.years).toBe('1815–1888');
      expect(after.saint.is_fallback).toBe(false);
      expect(after.image.credit).toBe('Photograph, c. 1880');
      expect(after.image.source).toBe('https://commons.wikimedia.org/wiki/File:Example.jpg');

      for (const variant of after.image.variants) {
        expect(variant.url).toBe(`img/${before.saint.id}-${variant.w}x${variant.h}.jpg`);
        expect(await exists(path.join(root, 'docs', 'v1', variant.url))).toBe(true);
      }
      expect(curatedRun.imagesRendered).toBe(VARIANTS.length);

      // A third run renders nothing further.
      const third = await generate({ root, today: TODAY });
      expect(third.imagesRendered).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
