/**
 * Regenerates the fallback plates in `fallbacks/`.
 *
 * Run by hand (`npm run plates`) when a plate's design changes, never as part
 * of a scheduled run. See `src/render/plates.ts`.
 */

import path from 'node:path';
import { writePlates } from '../render/plates.js';
import { repoRoot } from '../paths.js';

const written = await writePlates(path.join(repoRoot(), 'fallbacks'));
for (const file of written) {
  console.log(`wrote ${path.relative(repoRoot(), file)}`);
}
