/** Repository-relative path helpers, resolved from this file's own location. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_VERSION } from './config.js';

/** Absolute path to the repository root (this file compiles to `dist/paths.js`). */
export function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export interface Paths {
  readonly root: string;
  readonly saints: string;
  readonly originals: string;
  readonly fallbacks: string;
  /** The directory GitHub Pages publishes. */
  readonly docs: string;
  /** `docs/v1` — days live under `{yyyy}/`, images under `img/`. */
  readonly api: string;
  readonly img: string;
  readonly worklist: string;
}

export function pathsFor(root: string = repoRoot()): Paths {
  const docs = path.join(root, 'docs');
  const api = path.join(docs, API_VERSION);
  return {
    root,
    saints: path.join(root, 'saints'),
    originals: path.join(root, 'originals'),
    fallbacks: path.join(root, 'fallbacks'),
    docs,
    api,
    img: path.join(api, 'img'),
    worklist: path.join(root, 'WORKLIST.md'),
  };
}
