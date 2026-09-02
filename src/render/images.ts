/**
 * Image rendering.
 *
 * Filenames are content-shaped (`{id}-{w}x{h}.jpg`) and the variant sizes and
 * encoder settings are frozen, so a blob is written once and never rewritten.
 * A global re-render would write ~650MB of fresh blobs that stay in git history
 * forever, against a ~1GB GitHub Pages limit; doing it twice is unrecoverable
 * without a history rewrite.
 *
 * Every render therefore checks for an existing file first and skips it.
 */

import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { JPEG_OPTIONS, VARIANTS } from '../config.js';
import type { CropBox } from '../curation/schema.js';
import type { ImageVariant } from '../emit/record.js';

export interface RenderRequest {
  /** Content id the variants are named after. */
  readonly id: string;
  /** Absolute path to the source image. */
  readonly sourcePath: string;
  /** Region of the source to render, or null to use the whole image. */
  readonly crop: CropBox | null;
}

export interface RenderResult {
  readonly variants: readonly ImageVariant[];
  /** How many blobs this call actually wrote. Zero on a repeat run. */
  readonly rendered: number;
}

export function variantFileName(id: string, w: number, h: number): string {
  return `${id}-${w}x${h}.jpg`;
}

/** The `url` written into a day record: relative to `v1/`. */
export function variantUrl(id: string, w: number, h: number): string {
  return `img/${variantFileName(id, w, h)}`;
}

export function variantsFor(id: string): readonly ImageVariant[] {
  return VARIANTS.map(({ w, h }) => ({ w, h, url: variantUrl(id, w, h) }));
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders any missing variant of `request` into `imgDir`.
 *
 * Returns the variant descriptors regardless of whether anything was written,
 * so the caller can build the record either way.
 */
export async function renderVariants(
  request: RenderRequest,
  imgDir: string,
): Promise<RenderResult> {
  await mkdir(imgDir, { recursive: true });

  let rendered = 0;
  for (const { w, h } of VARIANTS) {
    const target = path.join(imgDir, variantFileName(request.id, w, h));
    if (await exists(target)) continue;

    let pipeline = sharp(request.sourcePath, { failOn: 'error' });
    if (request.crop) {
      pipeline = pipeline.extract({
        left: request.crop.x,
        top: request.crop.y,
        width: request.crop.width,
        height: request.crop.height,
      });
    }

    await pipeline
      // The three variants are not quite the same aspect ratio (1290x2796 is
      // 9:19.5, 1080x2400 is 9:20), so the crop box is covered rather than
      // stretched. Any residual trim comes off the centre.
      .resize(w, h, { fit: 'cover', position: 'centre' })
      // Strip EXIF and ICC: metadata varies between source files and would
      // otherwise leak non-determinism into the blob.
      .jpeg(JPEG_OPTIONS)
      .toFile(target);
    rendered += 1;
  }

  return { variants: variantsFor(request.id), rendered };
}

/**
 * Reads a source image's pixel dimensions.
 *
 * Accepts a path or the bytes themselves, so a candidate can be measured
 * before it is written anywhere.
 */
export async function imageSize(
  source: string | Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(source).metadata();
  const { width, height } = metadata;
  if (typeof width !== 'number' || typeof height !== 'number') {
    const label = typeof source === 'string' ? source : 'image';
    throw new Error(`${label}: could not read image dimensions`);
  }
  return { width, height };
}
