/**
 * `npm run generate` — the scheduled job.
 *
 * Accepts `--today=yyyy-MM-dd` to pin the window, and `--root=<dir>` to write
 * somewhere other than this checkout. Both exist for tests and for reproducing
 * a past run; a normal run passes neither.
 */

import { generate } from '../generate.js';
import { LiturgicalCalendar } from '../calendar/adapter.js';
import { isIsoDate } from '../dates.js';

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const today = flag('today');
if (today !== undefined && !isIsoDate(today)) {
  console.error(`--today must be a yyyy-MM-dd date, got ${JSON.stringify(today)}`);
  process.exit(2);
}

const root = flag('root');
const summary = await generate({
  ...(root === undefined ? {} : { root }),
  ...(today === undefined ? {} : { today }),
});

console.log(`romcal ${LiturgicalCalendar.version()}`);
console.log(
  `window ${summary.start} .. ${summary.end} (${summary.days} days, today ${summary.today})`,
);
console.log(`curated ${summary.curatedDays}, placeholder ${summary.placeholderDays}`);
console.log(`images rendered ${summary.imagesRendered}, days pruned ${summary.daysPruned}`);
