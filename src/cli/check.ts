/**
 * `npm run check:derived` — regenerates the published tree in place.
 *
 * Only the publish job writes under `docs/`; it is entirely derived. This
 * reproduces it so CI can diff, and a hand edit to the output shows up as a
 * dirty working tree.
 *
 * The window moves with the calendar, so a plain run would differ from a tree
 * published yesterday simply because a day has arrived at one edge and left the
 * other. `today` is therefore recovered from the tree itself: the earliest
 * published day is `today - WINDOW_DAYS_BEHIND`.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { WINDOW_DAYS_BEHIND } from '../config.js';
import { addDays, isIsoDate } from '../dates.js';
import { generate } from '../generate.js';
import { pathsFor } from '../paths.js';

const root = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--root='))
  ?.slice('--root='.length);

const paths = pathsFor(root);

async function earliestPublishedDay(): Promise<string | null> {
  let years: string[];
  try {
    years = (await readdir(paths.api)).filter((name) => /^\d{4}$/.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  for (const year of years) {
    const days = (await readdir(path.join(paths.api, year)))
      .filter((name) => name.endsWith('.json'))
      .map((name) => `${year}-${name.slice(0, -'.json'.length)}`)
      .filter(isIsoDate)
      .sort();
    if (days[0] !== undefined) return days[0];
  }
  return null;
}

const earliest = await earliestPublishedDay();
if (earliest === null) {
  console.log('Nothing published yet; nothing to check.');
  process.exit(0);
}

const today = addDays(earliest, WINDOW_DAYS_BEHIND);
const summary = await generate({
  ...(root === undefined ? {} : { root }),
  today,
});
console.log(
  `Regenerated ${summary.days} days for today=${today} (from earliest published ${earliest}).`,
);
