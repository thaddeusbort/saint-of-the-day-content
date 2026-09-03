/**
 * The curation queue.
 *
 * Built from the pipeline's own calendar and subject resolution rather than
 * from `WORKLIST.md` or the published tree. `WORKLIST.md` is markdown for
 * humans and is truncated; the published records carry `is_fallback` but not
 * whether the subject is a person at all. Running the real resolution gives
 * both, needs no contract change, and cannot drift from what the generator
 * will do with the same inputs.
 */

import { LiturgicalCalendar } from '../calendar/adapter.js';
import { WINDOW_DAYS_AHEAD } from '../config.js';
import { loadCuration } from '../curation/loader.js';
import { addDays, dateRange, todayUtc } from '../dates.js';
import { resolveSubject } from '../emit/subject.js';
import path from 'node:path';
import { pathsFor } from '../paths.js';

/** The entry already on disk for a curated subject. */
export interface CuratedEntry {
  readonly name: string;
  readonly years: string;
  readonly blurb: string;
  readonly credit: string;
  readonly license: string;
  readonly source: string;
  readonly crop: { x: number; y: number; width: number; height: number };
  /** Basename of the committed original, for display. */
  readonly original: string;
}

export interface QueueItem {
  /** Content id: the name of the YAML and original to create. */
  readonly id: string;
  readonly name: string;
  /** True for a person in the martyrology; false for a Sunday or ferial day. */
  readonly isSanctoral: boolean;
  /** False when the day's own celebration is this saint. */
  readonly isFallback: boolean;
  /** The soonest upcoming date this subject appears on. */
  readonly firstDate: string;
  /** Every date in the window this subject appears on. */
  readonly dates: readonly string[];
  /** The liturgical day on `firstDate`. */
  readonly celebration: string;
  readonly allCelebrations: readonly string[];
  readonly rank: string;
  readonly color: string;
  /** True when `saints/{id}.yaml` already exists. */
  readonly curated: boolean;
  /** The entry on disk, present only when `curated`. */
  readonly entry?: CuratedEntry;
}

export interface QueueOptions {
  readonly root?: string;
  readonly today?: string;
  /** How far ahead to look. Defaults to the pipeline's publishing window. */
  readonly horizonDays?: number;
}

export interface Queue {
  readonly today: string;
  readonly items: readonly QueueItem[];
  /** Subjects already curated, excluded from `items`. */
  readonly curatedCount: number;
}

/**
 * Every subject in the window, soonest first.
 *
 * Grouped by subject id: a saint appearing in more than one year in the window
 * is one job for the curator, not several.
 *
 * Curated subjects are marked rather than dropped, so the tool can show what
 * has already been done and re-curate it. The caller decides what to display.
 */
export async function buildQueue(options: QueueOptions = {}): Promise<Queue> {
  const paths = pathsFor(options.root);
  const today = options.today ?? todayUtc();
  const horizon = options.horizonDays ?? WINDOW_DAYS_AHEAD;

  const curation = await loadCuration(paths.saints, paths.originals);
  const calendar = new LiturgicalCalendar();

  const grouped = new Map<string, { item: QueueItem; dates: string[] }>();

  for (const date of dateRange(today, addDays(today, horizon))) {
    const day = await calendar.day(date);
    const subject = resolveSubject(day);
    const existing = grouped.get(subject.id);
    if (existing) {
      existing.dates.push(date);
      continue;
    }

    const dates: string[] = [date];
    const curated = curation.saints.get(subject.id);
    grouped.set(subject.id, {
      dates,
      item: {
        id: subject.id,
        name: subject.name,
        isSanctoral: subject.isSanctoral,
        isFallback: subject.isFallback,
        firstDate: date,
        dates,
        celebration: day.celebrations[0]?.name ?? '',
        allCelebrations: day.celebrations.map((celebration) => celebration.name),
        rank: day.rank,
        color: day.color,
        curated: curated !== undefined,
        ...(curated === undefined
          ? {}
          : {
              entry: {
                name: curated.entry.name,
                years: curated.entry.years,
                blurb: curated.entry.blurb,
                credit: curated.entry.credit,
                license: curated.entry.license,
                source: curated.entry.source,
                crop: curated.entry.crop,
                original: path.basename(curated.originalPath),
              },
            }),
      },
    });
  }

  // Dates are collected in ascending order, so the first is the soonest and
  // the group order already matches. Sorting explicitly keeps that a property
  // of this function rather than of the loop above.
  const items = [...grouped.values()]
    .map(({ item }) => item)
    .sort((a, b) =>
      a.firstDate === b.firstDate
        ? a.id.localeCompare(b.id)
        : a.firstDate.localeCompare(b.firstDate),
    );

  return { today, items, curatedCount: curation.saints.size };
}

/**
 * A search query for a subject.
 *
 * Commons indexes people by plain name, so the honorific and the trailing
 * titles that romcal carries ("Saint Gregory the Great, Pope and Doctor of the
 * Church") only dilute the match.
 */
export function defaultQuery(name: string): string {
  const withoutTitles = name.split(',')[0] ?? name;
  return withoutTitles
    .replace(/^(Saints?|Blessed|The)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
