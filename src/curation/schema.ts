/**
 * The curation file format: `saints/{id}.yaml`.
 *
 * Curators write these by hand, so parsing is strict and every error names the
 * file and the field. See CONTRIBUTING.md for the prose version.
 */

export interface CropBox {
  /** Left edge, in pixels from the left of the original. */
  readonly x: number;
  /** Top edge, in pixels from the top of the original. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SaintEntry {
  /** Derived from the filename, not written in the file. */
  readonly id: string;
  /** Display name, e.g. "St. John Bosco". */
  readonly name: string;
  /** Life span, e.g. "1815–1888". May be empty for saints without dates. */
  readonly years: string;
  readonly blurb: string;
  readonly credit: string;
  readonly license: string;
  readonly source: string;
  readonly crop: CropBox;
}

const REQUIRED_STRINGS = ['name', 'blurb', 'credit', 'license', 'source'] as const;
const CROP_FIELDS = ['x', 'y', 'width', 'height'] as const;

export class CurationError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = 'CurationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a parsed YAML document against the curation schema.
 *
 * `id` comes from the filename so the id can never disagree with the file it
 * lives in; `file` is used only for error messages.
 */
export function parseSaintEntry(id: string, file: string, document: unknown): SaintEntry {
  if (!isRecord(document)) {
    throw new CurationError(file, 'expected a YAML mapping at the top level');
  }

  const strings: Record<string, string> = {};
  for (const key of REQUIRED_STRINGS) {
    const value = document[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new CurationError(file, `\`${key}\` is required and must be a non-empty string`);
    }
    strings[key] = value.trim();
  }

  // `years` is the one optional string: not every saint has reliable dates.
  const years = document['years'];
  if (years !== undefined && typeof years !== 'string') {
    throw new CurationError(file, '`years` must be a string when present');
  }

  const source = strings['source'] as string;
  if (!isHttpUrl(source)) {
    throw new CurationError(
      file,
      `\`source\` must be an http(s) URL, got ${JSON.stringify(source)}`,
    );
  }

  const crop = document['crop'];
  if (!isRecord(crop)) {
    throw new CurationError(file, '`crop` is required and must be a mapping');
  }
  const box: Record<string, number> = {};
  for (const key of CROP_FIELDS) {
    const value = crop[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new CurationError(
        file,
        `\`crop.${key}\` is required and must be a non-negative integer`,
      );
    }
    box[key] = value;
  }
  if (box['width'] === 0 || box['height'] === 0) {
    throw new CurationError(file, '`crop.width` and `crop.height` must be greater than zero');
  }

  const unknownKeys = Object.keys(document).filter(
    (key) =>
      !REQUIRED_STRINGS.includes(key as (typeof REQUIRED_STRINGS)[number]) &&
      key !== 'years' &&
      key !== 'crop',
  );
  if (unknownKeys.length > 0) {
    throw new CurationError(file, `unknown field(s): ${unknownKeys.sort().join(', ')}`);
  }

  return {
    id,
    name: strings['name'] as string,
    years: (years ?? '').trim(),
    blurb: strings['blurb'] as string,
    credit: strings['credit'] as string,
    license: strings['license'] as string,
    source,
    crop: {
      x: box['x'] as number,
      y: box['y'] as number,
      width: box['width'] as number,
      height: box['height'] as number,
    },
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
