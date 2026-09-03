/**
 * Writing a curated saint.
 *
 * The whole reason this tool lives in the content repository is here: it
 * validates with the pipeline's own schema and geometry rules before it writes,
 * so it cannot produce a pull request that CI will reject. Nothing in this file
 * restates a rule that already exists in `src/curation/` or `src/config.ts`.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { VARIANTS } from '../config.js';
import { parseSaintEntry, type CropBox, type SaintEntry } from '../curation/schema.js';
import { imageSize } from '../render/images.js';
import { pathsFor } from '../paths.js';
import type { CommonsFile, Fetcher } from './commons.js';
import { fileByTitle } from './commons.js';

const LARGEST = VARIANTS[0];

/** Extensions the loader will look for, keyed by what Commons serves. */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export interface SaveRequest {
  readonly id: string;
  readonly name: string;
  readonly years: string;
  readonly blurb: string;
  /** Commons page title of the chosen file. */
  readonly fileTitle: string;
  readonly crop: CropBox;
}

export interface SaveResult {
  readonly id: string;
  readonly yamlPath: string;
  readonly originalPath: string;
  readonly entry: SaintEntry;
  /** Renders dropped so the next run redraws them from the new crop. */
  readonly staleRenders: number;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Downloads bytes. Injected so tests never touch the network. */
export type Downloader = (url: string) => Promise<Buffer>;

export const httpDownloader: Downloader = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'saint-of-the-day-content curation tool (https://github.com/thaddeusbort/saint-of-the-day-content)',
    },
  });
  if (!response.ok) {
    throw new SaveError(`Could not download the image: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

export interface SaveDeps {
  readonly fetcher: Fetcher;
  readonly downloader: Downloader;
  readonly root?: string;
}

/**
 * Writes `originals/{id}.{ext}` and `saints/{id}.yaml`.
 *
 * The licence, credit and source are re-read from Commons here rather than
 * taken from the request, so the attribution recorded in the repository is
 * always what Commons actually says — a client cannot assert it.
 */
export async function saveCuratedSaint(request: SaveRequest, deps: SaveDeps): Promise<SaveResult> {
  const paths = pathsFor(deps.root);

  const file = await fileByTitle(deps.fetcher, request.fileTitle);
  if (!file) {
    throw new SaveError(`Commons has no file titled ${JSON.stringify(request.fileTitle)}`);
  }
  if (!file.licenseAccepted) {
    throw new SaveError(
      `Refusing to save: the licence on ${file.title} is ${
        file.license === '' ? 'unreadable' : JSON.stringify(file.license)
      }, which this tool will not publish.`,
    );
  }
  if (!file.largeEnough) {
    throw new SaveError(
      `${file.title} is ${file.width}x${file.height}, too small for a ${LARGEST.w}x${LARGEST.h} crop.`,
    );
  }

  assertCropFits(request.crop, file);

  const extension = EXTENSION_BY_MIME[file.mime];
  if (extension === undefined) {
    throw new SaveError(`Unsupported image type ${JSON.stringify(file.mime)} on ${file.title}`);
  }

  // Build and validate the entry before writing anything, so a rejected entry
  // leaves no half-curated saint behind.
  const document = {
    name: request.name,
    ...(request.years.trim() === '' ? {} : { years: request.years.trim() }),
    blurb: request.blurb,
    credit: file.credit === '' ? 'Wikimedia Commons' : file.credit,
    license: file.license,
    source: file.descriptionUrl,
    crop: request.crop,
  };
  const yamlFile = path.join(paths.saints, `${request.id}.yaml`);
  // Label errors with the repository-relative path: the message goes to the
  // browser, and the curator does not need this checkout's absolute paths.
  const entry = parseSaintEntry(request.id, `saints/${request.id}.yaml`, document);

  const bytes = await deps.downloader(file.url);

  // Measure the bytes actually served, not what the metadata claimed — Commons
  // can disagree with itself. This runs before anything is written, so a
  // mismatch leaves the working tree untouched rather than stranding an
  // original with no entry beside it.
  assertCropFits(request.crop, await imageSize(bytes));

  const originalPath = path.join(paths.originals, `${request.id}${extension}`);
  await mkdir(paths.originals, { recursive: true });
  await mkdir(paths.saints, { recursive: true });
  await writeFile(originalPath, bytes);
  try {
    await writeFile(yamlFile, stringifyYaml(document, { lineWidth: 80 }), 'utf8');
  } catch (error) {
    // A saint is two files or none. If the entry cannot be written, take the
    // original back out rather than leaving one CI will reject as orphaned.
    await rm(originalPath, { force: true });
    throw error;
  }

  // Renders are keyed by id and size and are never rewritten, so a re-crop of
  // an existing saint would change the entry and nothing else. Dropping this
  // id's renders lets the next run redraw them from the new crop. It is the
  // one place this tool touches docs/, and it is scoped to a single subject
  // the curator deliberately re-framed — deterministic rendering means an
  // unchanged crop reproduces byte-identical files and costs no history.
  const staleRenders = await removeRenders(paths.img, request.id);

  return { id: request.id, yamlPath: yamlFile, originalPath, entry, staleRenders };
}

/** Deletes every rendered variant of `id`. Returns how many were removed. */
async function removeRenders(imgDir: string, id: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(imgDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const prefix = `${id}-`;
  const mine = names.filter((name) => name.startsWith(prefix) && name.endsWith('.jpg'));
  for (const name of mine) await rm(path.join(imgDir, name), { force: true });
  return mine.length;
}

function assertCropFits(crop: CropBox, image: { width: number; height: number }): void {
  if (crop.width < LARGEST.w || crop.height < LARGEST.h) {
    throw new SaveError(
      `Crop is ${crop.width}x${crop.height}, smaller than the largest variant ${LARGEST.w}x${LARGEST.h}; ` +
        'the image would have to be upscaled.',
    );
  }
  if (crop.x + crop.width > image.width || crop.y + crop.height > image.height) {
    throw new SaveError(
      `Crop ${crop.width}x${crop.height} at (${crop.x},${crop.y}) falls outside the ` +
        `${image.width}x${image.height} image.`,
    );
  }
}

/** Renders what the app will actually show, at full variant size. */
export async function renderPreview(
  file: CommonsFile,
  crop: CropBox,
  downloader: Downloader,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const bytes = await downloader(file.url);
  return sharp(bytes)
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .resize(LARGEST.w, LARGEST.h, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 70 })
    .toBuffer();
}
