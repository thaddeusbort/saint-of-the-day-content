/**
 * A run.
 *
 *  1. Compute the calendar for `[today - 7, today + 400]`.
 *  2. Resolve a subject per day.
 *  3. Emit the day JSON — curated record if `saints/{id}.yaml` exists,
 *     placeholder record otherwise.
 *  4. Render any variant JPEG that does not already exist; skip every one that
 *     does.
 *  5. Delete published days outside the window.
 *  6. Rewrite `WORKLIST.md`.
 *
 * Committing is the caller's job (see `.github/workflows/publish.yml`).
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LiturgicalCalendar } from './calendar/adapter.js';
import { FALLBACK_COLORS, WINDOW_DAYS_AHEAD, WINDOW_DAYS_BEHIND } from './config.js';
import { loadCuration, type Curation } from './curation/loader.js';
import { addDays, dateRange, isIsoDate, todayUtc } from './dates.js';
import { buildDay, fallbackImageId } from './emit/day.js';
import { resolveSubject } from './emit/subject.js';
import { stringify } from './json.js';
import { pathsFor, type Paths } from './paths.js';
import { plateFileName } from './render/plates.js';
import { renderVariants } from './render/images.js';
import { renderWorklist, type WorklistItem } from './worklist.js';

export interface GenerateOptions {
  /** Repository root. Defaults to the checkout this code was built in. */
  readonly root?: string;
  /** The date the run treats as "today". Defaults to the current UTC date. */
  readonly today?: string;
}

export interface GenerateSummary {
  readonly today: string;
  readonly start: string;
  readonly end: string;
  readonly days: number;
  readonly curatedDays: number;
  readonly placeholderDays: number;
  readonly imagesRendered: number;
  readonly daysPruned: number;
}

/** Writes `file` only when its content would change, to keep mtimes stable. */
async function writeIfChanged(file: string, content: string): Promise<boolean> {
  try {
    if ((await readFile(file, 'utf8')) === content) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
  return true;
}

/** Removes published day files outside `[start, end]`, and any year left empty. */
async function prune(paths: Paths, start: string, end: string): Promise<number> {
  let removed = 0;
  let years: string[];
  try {
    years = await readdir(paths.api);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  for (const year of years.sort()) {
    if (!/^\d{4}$/.test(year)) continue;
    const yearDir = path.join(paths.api, year);
    const files = (await readdir(yearDir)).sort();
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const date = `${year}-${file.slice(0, -'.json'.length)}`;
      if (isIsoDate(date) && date >= start && date <= end) continue;
      await rm(path.join(yearDir, file));
      removed += 1;
    }
    if ((await readdir(yearDir)).length === 0) {
      await rm(yearDir, { recursive: true });
    }
  }
  return removed;
}

/**
 * Renders the colour plates into `v1/img/`.
 *
 * Done up front so that a placeholder record never points at a file that does
 * not exist yet — the app abandons the rest of its prefetch window on the first
 * failed request.
 */
async function renderPlates(paths: Paths): Promise<number> {
  let rendered = 0;
  for (const color of FALLBACK_COLORS) {
    const result = await renderVariants(
      {
        id: fallbackImageId(color),
        sourcePath: path.join(paths.fallbacks, plateFileName(color)),
        crop: null,
      },
      paths.img,
    );
    rendered += result.rendered;
  }
  return rendered;
}

export async function generate(options: GenerateOptions = {}): Promise<GenerateSummary> {
  const paths = pathsFor(options.root);
  const today = options.today ?? todayUtc();
  const start = addDays(today, -WINDOW_DAYS_BEHIND);
  const end = addDays(today, WINDOW_DAYS_AHEAD);

  const curation: Curation = await loadCuration(paths.saints, paths.originals);
  for (const id of curation.missingOriginals) {
    // Not fatal: the day simply stays on its placeholder. PR validation is
    // where this is meant to be caught.
    console.warn(`warning: saints/${id}.yaml has no matching original; keeping placeholder`);
  }

  await mkdir(paths.api, { recursive: true });
  await writeIfChanged(path.join(paths.docs, '.nojekyll'), '');

  let imagesRendered = await renderPlates(paths);
  const calendar = new LiturgicalCalendar();
  const worklist: WorklistItem[] = [];
  let curatedDays = 0;

  const dates = dateRange(start, end);
  for (const date of dates) {
    const day = await calendar.day(date);
    const curated = curation.saints.get(resolveSubject(day).id);
    const { record, subject, imageId } = buildDay(day, curated);

    if (curated) {
      const result = await renderVariants(
        { id: imageId, sourcePath: curated.originalPath, crop: curated.entry.crop },
        paths.img,
      );
      imagesRendered += result.rendered;
      curatedDays += 1;
    } else {
      worklist.push({
        date,
        subject,
        rank: record.rank,
        color: record.color,
      });
    }

    await writeIfChanged(
      path.join(paths.api, date.slice(0, 4), `${date.slice(5)}.json`),
      stringify(record),
    );
  }

  const daysPruned = await prune(paths, start, end);
  await writeIfChanged(paths.worklist, renderWorklist(today, worklist));

  return {
    today,
    start,
    end,
    days: dates.length,
    curatedDays,
    placeholderDays: dates.length - curatedDays,
    imagesRendered,
    daysPruned,
  };
}
