/**
 * Curation PR validation.
 *
 * These checks are mechanical only. CI cannot verify that an image is actually
 * in the public domain, and this file must not imply that it does: a non-empty
 * `license` string proves nothing at all. Licence clearance and blurb quality
 * are human judgement and stay human — see CONTRIBUTING.md.
 */

import path from 'node:path';
import { VARIANTS } from './config.js';
import { loadCuration } from './curation/loader.js';
import { CurationError } from './curation/schema.js';
import { imageSize } from './render/images.js';
import { pathsFor } from './paths.js';

const LARGEST = VARIANTS[0];

export interface ValidationReport {
  readonly checked: number;
  readonly problems: readonly string[];
}

export async function validateCuration(root?: string): Promise<ValidationReport> {
  const paths = pathsFor(root);
  const problems: string[] = [];

  let curation;
  try {
    curation = await loadCuration(paths.saints, paths.originals);
  } catch (error) {
    if (error instanceof CurationError) {
      return { checked: 0, problems: [error.message] };
    }
    throw error;
  }

  for (const id of curation.missingOriginals) {
    problems.push(`saints/${id}.yaml has no matching image in originals/`);
  }
  for (const name of curation.orphanedOriginals) {
    problems.push(`originals/${name} has no matching saints/*.yaml`);
  }

  for (const [id, { entry, originalPath }] of [...curation.saints].sort(([a], [b]) => a.localeCompare(b))) {
    const original = `originals/${path.basename(originalPath)}`;
    let size;
    try {
      size = await imageSize(originalPath);
    } catch (error) {
      problems.push(`${original}: could not be read as an image (${(error as Error).message})`);
      continue;
    }

    const { crop } = entry;
    if (crop.x + crop.width > size.width || crop.y + crop.height > size.height) {
      problems.push(
        `saints/${id}.yaml: crop box ${crop.width}x${crop.height} at (${crop.x},${crop.y}) ` +
          `falls outside ${original}, which is ${size.width}x${size.height}`,
      );
      continue;
    }

    // Rendering never upscales, so the crop must be at least as large as the
    // largest variant in both dimensions.
    if (crop.width < LARGEST.w || crop.height < LARGEST.h) {
      problems.push(
        `saints/${id}.yaml: crop box is ${crop.width}x${crop.height}, ` +
          `smaller than the largest variant ${LARGEST.w}x${LARGEST.h}; ` +
          'the image would have to be upscaled',
      );
    }
  }

  return { checked: curation.saints.size, problems };
}
