/**
 * Frozen pipeline configuration.
 *
 * The values in this file are part of the published contract. Changing
 * VARIANTS or JPEG_OPTIONS invalidates every image blob already committed,
 * which is unrecoverable without a history rewrite (see README, "Never
 * re-render"). If the render settings genuinely must change, that is a new
 * repository and a bump to `v2/`.
 */

/** Schema version embedded in every day record. Matches the `v1/` path segment. */
export const SCHEMA_VERSION = 1;

/** Path segment under `docs/` that the app appends to its base URL. */
export const API_VERSION = 'v1';

/**
 * Days of trailing margin. The app reads the *device's* local date, so a
 * device at UTC-12 can ask for a date that is still "yesterday" here. Seven
 * days is far more than the 1-day timezone spread requires; the surplus keeps
 * recently published days readable while a device catches up.
 */
export const WINDOW_DAYS_BEHIND = 7;

/**
 * Days of forward coverage. The app's prefetch abandons the remainder of its
 * window on the first IOException, so coverage must be contiguous and
 * comfortably deeper than any window the app might ask for.
 */
export const WINDOW_DAYS_AHEAD = 400;

/** Rendered variant sizes, in descending order of width. FROZEN. */
export const VARIANTS = [
  { w: 1290, h: 2796 },
  { w: 1179, h: 2556 },
  { w: 1080, h: 2400 },
] as const;

/** JPEG encoder settings. FROZEN. */
export const JPEG_OPTIONS = {
  quality: 82,
  progressive: true,
  chromaSubsampling: '4:2:0',
  mozjpeg: false,
} as const;

/** Liturgical colours that have a fallback plate. */
export const FALLBACK_COLORS = ['white', 'red', 'green', 'violet', 'rose'] as const;

export type FallbackColor = (typeof FALLBACK_COLORS)[number];

/** Colour used when a day's colour has no plate of its own. */
export const DEFAULT_FALLBACK_COLOR: FallbackColor = 'white';

/** Attribution written onto placeholder records. */
export const PLACEHOLDER_IMAGE_META = {
  credit: 'Generated liturgical colour plate',
  license: 'CC0-1.0',
  source: 'https://github.com/thaddeusbort/saint-of-the-day-content',
} as const;
