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

/**
 * Rendered variant sizes, in descending order of width. FROZEN.
 *
 * All three are exactly 20:9 (width / 9 * 20 = height), which is the tallest
 * common Android aspect. Sharing one ratio means the crop box matches every
 * variant exactly: the smaller two are pure downscales of the largest, with no
 * further cropping, so what the curator previews is what the device gets.
 *
 * The app picks the variant nearest the screen by |dw| + |dh|, not the
 * smallest that covers it, so a device between two sizes can be served a
 * slightly smaller image and upscale it. 1260x2800 sits where it minimises
 * that worst case across the plausible width range (~1.08x, against ~1.17x
 * with only 1080 and 1440).
 */
export const VARIANTS = [
  { w: 1440, h: 3200 },
  { w: 1260, h: 2800 },
  { w: 1080, h: 2400 },
] as const;

/** JPEG encoder settings. FROZEN. */
export const JPEG_OPTIONS = {
  quality: 82,
  progressive: true,
  chromaSubsampling: '4:2:0',
  mozjpeg: false,
} as const;

/**
 * The lowest Table of Liturgical Days rank that still admits a saint the day
 * does not itself celebrate.
 *
 * Ranks 1 to 5 are the Triduum, the solemnities, the privileged Sundays of
 * Advent, Lent and Easter, Ash Wednesday, Holy Week, the Easter octave and the
 * feasts of the Lord. Those days admit no other celebration (UNLY nn. 59-61),
 * so the pipeline must not put another saint on them: Christmas Day is the
 * Nativity, not an obscure martyr who shares the date.
 *
 * Rank 6 and below — Sundays in Ordinary Time, feasts, ferial weekdays — do
 * admit one, which is where a martyrology saint would go.
 */
export const LOWEST_PRIVILEGED_TABLE_RANK = 5;

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
