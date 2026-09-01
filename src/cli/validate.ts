/**
 * `npm run validate` — the check that runs on curation pull requests.
 *
 * Exits non-zero with one line per problem. See `src/validate.ts` for what is
 * and is not checked.
 */

import { validateCuration } from '../validate.js';

const report = await validateCuration(
  process.argv.slice(2).find((arg) => arg.startsWith('--root='))?.slice('--root='.length),
);

for (const problem of report.problems) {
  console.error(`error: ${problem}`);
}

if (report.problems.length > 0) {
  console.error(`\n${report.problems.length} problem(s) in ${report.checked} curated saint(s).`);
  process.exit(1);
}

console.log(`${report.checked} curated saint(s) validated.`);
console.log('Note: licence clearance is not machine-checkable and remains the curator’s responsibility.');
