/**
 * Crop geometry.
 *
 * All variants share one aspect ratio, so a crop is judged against the largest
 * of them: if it can produce that, the smaller two are pure downscales.
 */

import { MAX_UPSCALE, VARIANTS } from './config.js';
import type { CropBox } from './curation/schema.js';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** VARIANTS uses `w`/`h`; this module speaks in `width`/`height`. */
const LARGEST: Size = { width: VARIANTS[0].w, height: VARIANTS[0].h };

/** The largest crop of the render's aspect ratio that fits inside `source`. */
export function largestCropIn(source: Size, target: Size = LARGEST): Size {
  const ratio = target.width / target.height;
  let height = Math.min(source.height, Math.floor(source.width / ratio));
  let width = Math.round(height * ratio);
  if (width > source.width) {
    width = source.width;
    height = Math.round(width / ratio);
  }
  return { width, height };
}

/**
 * How much a crop must be enlarged to reach the largest variant.
 *
 * 1 or below means no upscaling. Crop and target share an aspect ratio, so one
 * axis decides it; the larger of the two is taken anyway, in case a crop is
 * slightly off-ratio.
 */
export function upscaleFactor(crop: Size, target: Size = LARGEST): number {
  return Math.max(target.width / crop.width, target.height / crop.height);
}

/** The upscale a source would need, at its best possible crop. */
export function sourceUpscaleFactor(source: Size, target: Size = LARGEST): number {
  return upscaleFactor(largestCropIn(source, target), target);
}

/**
 * The smallest source worth offering at all: anything needing more than
 * {@link MAX_UPSCALE} is refused however the curator feels about it.
 */
export function minimumSource(target: Size = LARGEST): Size {
  return {
    width: Math.ceil(target.width / MAX_UPSCALE),
    height: Math.ceil(target.height / MAX_UPSCALE),
  };
}

export interface CropVerdict {
  readonly ok: boolean;
  /** 1 when no enlargement is needed. */
  readonly factor: number;
  readonly reason?: string;
}

/**
 * Judges a crop against the frozen render size.
 *
 * Without `allowUpscale` the crop must be at least the largest variant, which
 * is the long-standing rule. With it, the crop may be smaller, but never by
 * more than {@link MAX_UPSCALE} — the exception is for a good painting that
 * only exists small, not for any thumbnail at all.
 */
export function judgeCrop(
  crop: CropBox,
  allowUpscale: boolean,
  target: Size = LARGEST,
): CropVerdict {
  const factor = upscaleFactor(crop, target);
  if (factor <= 1) return { ok: true, factor: 1 };
  if (!allowUpscale) {
    return {
      ok: false,
      factor,
      reason:
        `crop is ${crop.width}x${crop.height}, smaller than the largest variant ` +
        `${target.width}x${target.height}; set \`allow_upscale: true\` to enlarge it ` +
        `${factor.toFixed(2)}x, or use a larger source`,
    };
  }
  if (factor > MAX_UPSCALE) {
    return {
      ok: false,
      factor,
      reason:
        `crop is ${crop.width}x${crop.height} and would need ${factor.toFixed(2)}x enlargement ` +
        `to reach ${target.width}x${target.height}, beyond the ${MAX_UPSCALE}x limit`,
    };
  }
  return { ok: true, factor };
}
