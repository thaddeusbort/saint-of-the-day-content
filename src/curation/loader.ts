/**
 * Reads the `saints/` and `originals/` directories.
 *
 * Curation is an input, not a step: the job reads whatever exists on the day it
 * runs and never writes here.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CurationError, parseSaintEntry, type SaintEntry } from './schema.js';

/** Image extensions accepted for a committed original, in preference order. */
export const ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

export interface CuratedSaint {
  readonly entry: SaintEntry;
  /** Absolute path to the committed original image. */
  readonly originalPath: string;
}

export interface Curation {
  /** Curated saints by content id. */
  readonly saints: ReadonlyMap<string, CuratedSaint>;
  /** Ids that have a YAML file but no original image. */
  readonly missingOriginals: readonly string[];
  /** Original image basenames that have no YAML file. */
  readonly orphanedOriginals: readonly string[];
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Finds the committed original for `id`, or null. */
async function findOriginal(
  originalsDir: string,
  names: Set<string>,
  id: string,
): Promise<string | null> {
  for (const extension of ORIGINAL_EXTENSIONS) {
    if (names.has(`${id}${extension}`)) {
      return path.join(originalsDir, `${id}${extension}`);
    }
  }
  return null;
}

/**
 * Loads every curated saint.
 *
 * A YAML file that fails to parse is fatal: silently dropping it would publish
 * a placeholder over a saint the curator believed was live.
 */
export async function loadCuration(saintsDir: string, originalsDir: string): Promise<Curation> {
  const yamlFiles = (await listDir(saintsDir)).filter((name) => name.endsWith('.yaml'));
  const originalNames = new Set(
    (await listDir(originalsDir)).filter((name) =>
      ORIGINAL_EXTENSIONS.some((extension) => name.endsWith(extension)),
    ),
  );

  const saints = new Map<string, CuratedSaint>();
  const missingOriginals: string[] = [];
  const claimed = new Set<string>();

  for (const fileName of yamlFiles) {
    const id = fileName.slice(0, -'.yaml'.length);
    const file = path.join(saintsDir, fileName);
    const raw = await readFile(file, 'utf8');

    let document: unknown;
    try {
      document = parseYaml(raw);
    } catch (error) {
      throw new CurationError(file, `invalid YAML: ${(error as Error).message}`);
    }

    const entry = parseSaintEntry(id, file, document);
    const originalPath = await findOriginal(originalsDir, originalNames, id);
    if (!originalPath) {
      missingOriginals.push(id);
      continue;
    }
    claimed.add(path.basename(originalPath));
    saints.set(id, { entry, originalPath });
  }

  const orphanedOriginals = [...originalNames].filter((name) => !claimed.has(name)).sort();

  return { saints, missingOriginals, orphanedOriginals };
}
