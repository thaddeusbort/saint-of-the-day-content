/**
 * `npm run curate` — the curation tool.
 *
 * Serves a local page that walks the outstanding queue soonest first, searches
 * Wikimedia Commons, and writes `saints/{id}.yaml` and `originals/{id}.*`.
 * It binds to loopback and never writes under `docs/`.
 */

import { createCurationServer } from '../curate/server.js';
import { LiturgicalCalendar } from '../calendar/adapter.js';
import { isIsoDate } from '../dates.js';

const flag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

const today = flag('today');
if (today !== undefined && !isIsoDate(today)) {
  console.error(`--today must be a yyyy-MM-dd date, got ${JSON.stringify(today)}`);
  process.exit(2);
}

const port = Number(flag('port') ?? 4173);
const horizon = flag('horizon');
const root = flag('root');

const server = createCurationServer({
  port,
  ...(root === undefined ? {} : { root }),
  ...(today === undefined ? {} : { today }),
  ...(horizon === undefined ? {} : { horizonDays: Number(horizon) }),
});

server.listen(port, '127.0.0.1', () => {
  console.log(`romcal ${LiturgicalCalendar.version()}`);
  console.log(`Curation tool on http://127.0.0.1:${port}`);
  console.log('Writes saints/ and originals/ only. Ctrl-C to stop.');
});
