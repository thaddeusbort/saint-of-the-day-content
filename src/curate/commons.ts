/**
 * Wikimedia Commons search.
 *
 * Commons is the only source this tool searches, and that is a deliberate
 * constraint rather than a convenience. CI cannot verify that an image is free
 * to publish, so the tool must not make it easy to save one that is not:
 * generic image search would turn a two-second click into a licensing claim
 * nobody checked.
 *
 * Commons returns machine-readable licence, author and attribution metadata
 * per file, so `credit`, `license` and `source` are derived from the API rather
 * than typed from memory, and anything whose licence cannot be read is refused.
 */

import { VARIANTS } from '../config.js';

const API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Wikimedia asks API clients to identify themselves.
 * https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
 */
const USER_AGENT =
  'saint-of-the-day-content curation tool (https://github.com/thaddeusbort/saint-of-the-day-content)';

const LARGEST = VARIANTS[0];

/**
 * Narrows a search to files big enough to crop.
 *
 * `filew:` and `fileh:` are CirrusSearch file-property keywords and take a
 * range, so the same minimum the renderer enforces can be pushed into the
 * query. That matters for paging: without it a page of 24 results can be
 * almost entirely unusable, and "load more" walks through junk.
 *
 * It narrows rather than replaces the check on the way in — `largeEnough` is
 * still computed from the dimensions Commons reports, so correctness never
 * depends on the query being right.
 *
 * https://www.mediawiki.org/wiki/Help:CirrusSearch
 */
export function sizeClause(minWidth: number, minHeight: number): string {
  // Strict `>`, so subtract one to keep an exactly-minimum image.
  return `filew:>${minWidth - 1} fileh:>${minHeight - 1}`;
}

/**
 * Words that mark a photograph of a thing named after a saint rather than an
 * image of the saint: churches, chapels, streets, schools, monuments.
 *
 * A leading `-` is CirrusSearch's negation and applies to the file's title,
 * description and categories. This is blunt on purpose and cuts real images
 * too — a painting whose description mentions the church holding it is
 * excluded — so it is off by default and lives here as one editable list.
 */
export const EXCLUDED_TERMS = [
  'church',
  'chapel',
  'cathedral',
  'basilica',
  'parish',
  'interior',
  'exterior',
  'facade',
  'monument',
  'plaque',
  'street',
  'school',
  'hospital',
  'map',
  'flag',
  'stamp',
  '"coat of arms"',
] as const;

export const EXCLUDE_CLAUSE = EXCLUDED_TERMS.map((term) => `-${term}`).join(' ');

/** Machine-readable licence codes accepted without question. */
const FREE_LICENSE_PREFIXES = ['pd', 'cc0', 'cc-by', 'cc-pd'] as const;

export interface CommonsFile {
  /** Commons page title, e.g. `File:Don Bosco.jpg`. Stable identifier. */
  readonly title: string;
  /** Direct URL to the full-resolution original. */
  readonly url: string;
  /** URL of the file description page — what goes into `source`. */
  readonly descriptionUrl: string;
  /** Scaled preview for the results grid. */
  readonly thumbUrl: string;
  readonly width: number;
  readonly height: number;
  readonly mime: string;
  /** Attribution line, derived from the file's metadata. */
  readonly credit: string;
  /** Human-readable licence name, e.g. "Public domain", "CC BY-SA 4.0". */
  readonly license: string;
  /** Machine-readable licence code, e.g. `pd`, `cc-by-sa-4.0`. May be empty. */
  readonly licenseCode: string;
  /** True when the licence is one this tool will save. */
  readonly licenseAccepted: boolean;
  /**
   * True when a {@link LARGEST}-sized crop fits inside the original. Anything
   * smaller would have to be upscaled, which the renderer refuses to do.
   */
  readonly largeEnough: boolean;
  /** Any usage restriction Commons flags (trademark, personality rights). */
  readonly restrictions: string;
  /** Commons' own description, shown for reference. Never copied into a blurb. */
  readonly description: string;
}

/** Injected so tests never touch the network. */
export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function text(value: unknown): string {
  if (typeof value !== 'string') return '';
  // extmetadata values are HTML fragments.
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function meta(extmetadata: unknown, key: string): string {
  if (typeof extmetadata !== 'object' || extmetadata === null) return '';
  const field = (extmetadata as Record<string, unknown>)[key];
  if (typeof field !== 'object' || field === null) return '';
  return text((field as Record<string, unknown>).value);
}

export function isFreeLicense(code: string, name: string): boolean {
  const normalized = code.trim().toLowerCase();
  if (normalized !== '') {
    // Reject the non-free Creative Commons variants explicitly: a licence that
    // forbids commercial use or derivatives is not one to publish under.
    if (normalized.includes('-nc') || normalized.includes('-nd')) return false;
    return FREE_LICENSE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }
  // Fall back to the human-readable name only for the unambiguous public
  // domain wordings; anything else counts as unreadable and is refused.
  return /^public domain\b/i.test(name.trim());
}

/** Builds the attribution line from whatever the file actually carries. */
function creditFor(extmetadata: unknown): string {
  const artist = meta(extmetadata, 'Artist');
  const credit = meta(extmetadata, 'Credit');
  const date = meta(extmetadata, 'DateTimeOriginal');
  const parts = [artist || credit, date].filter((part) => part !== '');
  return parts.join(', ');
}

function toFile(page: Record<string, unknown>): CommonsFile | null {
  const info = Array.isArray(page['imageinfo']) ? page['imageinfo'][0] : undefined;
  if (typeof info !== 'object' || info === null) return null;
  const record = info as Record<string, unknown>;

  const url = typeof record['url'] === 'string' ? record['url'] : '';
  const descriptionUrl =
    typeof record['descriptionurl'] === 'string' ? record['descriptionurl'] : '';
  const width = typeof record['width'] === 'number' ? record['width'] : 0;
  const height = typeof record['height'] === 'number' ? record['height'] : 0;
  if (url === '' || descriptionUrl === '' || width === 0 || height === 0) return null;

  const extmetadata = record['extmetadata'];
  const licenseCode = meta(extmetadata, 'License');
  const license = meta(extmetadata, 'LicenseShortName') || meta(extmetadata, 'UsageTerms');

  return {
    title: typeof page['title'] === 'string' ? page['title'] : '',
    url,
    descriptionUrl,
    thumbUrl: typeof record['thumburl'] === 'string' ? record['thumburl'] : url,
    width,
    height,
    mime: typeof record['mime'] === 'string' ? record['mime'] : '',
    credit: creditFor(extmetadata),
    license,
    licenseCode,
    licenseAccepted: isFreeLicense(licenseCode, license),
    largeEnough: width >= LARGEST.w && height >= LARGEST.h,
    restrictions: meta(extmetadata, 'Restrictions'),
    description: meta(extmetadata, 'ImageDescription'),
  };
}

async function query(fetcher: Fetcher, params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({
    action: 'query',
    format: 'json',
    // formatversion 2 returns `pages` as an array with the title on each entry.
    formatversion: '2',
    ...params,
  })}`;
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Commons API returned ${response.status}`);
  }
  return response.json();
}

function pagesOf(payload: unknown): Record<string, unknown>[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const container = (payload as Record<string, unknown>)['query'];
  if (typeof container !== 'object' || container === null) return [];
  const pages = (container as Record<string, unknown>)['pages'];
  if (Array.isArray(pages)) return pages as Record<string, unknown>[];
  if (typeof pages === 'object' && pages !== null)
    return Object.values(pages as Record<string, unknown>) as Record<string, unknown>[];
  return [];
}

export interface SearchResult {
  readonly files: readonly CommonsFile[];
  /** Results dropped because their licence could not be read or is not free. */
  readonly rejectedForLicense: number;
  /** Offset to pass back for the next page, or null when the results ran out. */
  readonly nextOffset: number | null;
}

/**
 * Searches Commons for images matching `term`.
 *
 * Files whose licence is not demonstrably free are dropped entirely. Files that
 * are too small are kept but flagged, so the constraint is visible rather than
 * mysterious.
 */
export interface SearchOptions {
  readonly limit?: number;
  readonly offset?: number;
  /** Narrow to files at least this large. See {@link sizeClause}. */
  readonly minWidth?: number;
  readonly minHeight?: number;
  /** Exclude buildings and objects named after the saint. */
  readonly excludeStructures?: boolean;
}

export async function search(
  fetcher: Fetcher,
  term: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const limit = options.limit ?? 24;
  const offset = options.offset ?? 0;
  const clauses = ['filetype:bitmap'];
  if (options.minWidth !== undefined && options.minHeight !== undefined) {
    clauses.push(sizeClause(options.minWidth, options.minHeight));
  }
  if (options.excludeStructures === true) clauses.push(EXCLUDE_CLAUSE);
  // The term goes in last and untouched, so a curator can add their own
  // CirrusSearch syntax — another `-word`, an `incategory:` — from the box.
  clauses.push(term);
  const payload = await query(fetcher, {
    generator: 'search',
    gsrsearch: clauses.join(' '),
    gsrnamespace: '6',
    gsrlimit: String(limit),
    ...(offset > 0 ? { gsroffset: String(offset) } : {}),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '320',
  });

  const all = pagesOf(payload)
    .map(toFile)
    .filter((file): file is CommonsFile => file !== null);

  const files = all.filter((file) => file.licenseAccepted);
  // Usable images first, then the largest, so the best candidate leads.
  const sorted = [...files].sort((a, b) => {
    if (a.largeEnough !== b.largeEnough) return a.largeEnough ? -1 : 1;
    return b.width * b.height - a.width * a.height;
  });

  return {
    files: sorted,
    rejectedForLicense: all.length - files.length,
    // Commons signals more results with a continuation offset. Fall back to
    // counting a full page, so paging still works if it is absent.
    nextOffset: continueOffset(payload) ?? (all.length >= limit ? offset + limit : null),
  };
}

/** Reads `continue.gsroffset` from a search response, when present. */
function continueOffset(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const cont = (payload as Record<string, unknown>)['continue'];
  if (typeof cont !== 'object' || cont === null) return null;
  const value = (cont as Record<string, unknown>)['gsroffset'];
  return typeof value === 'number' ? value : null;
}

/**
 * Re-reads one file's metadata by title.
 *
 * Save re-fetches rather than trusting the client, so the attribution written
 * into the repository always comes from Commons.
 */
export async function fileByTitle(
  fetcher: Fetcher,
  title: string,
  thumbWidth = 320,
): Promise<CommonsFile | null> {
  const payload = await query(fetcher, {
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(thumbWidth),
  });
  const [page] = pagesOf(payload);
  return page ? toFile(page) : null;
}

/** The real fetcher, used outside tests. */
export const httpFetcher: Fetcher = (url, init) => fetch(url, init);
