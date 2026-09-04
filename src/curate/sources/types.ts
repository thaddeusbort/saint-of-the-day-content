/**
 * Image sources.
 *
 * Commons is not the only place a public-domain painting lives, and it is
 * often not the place holding the largest scan. A source is anything that can
 * answer two questions: what matches this search, and — given a reference back
 * — what does the API say about this file *now*.
 *
 * That second one is the important one. Attribution is always re-read from the
 * source on save rather than taken from the client, so whatever is recorded in
 * the repository is what the source actually claims.
 */

import { sourceUpscaleFactor } from '../../crop.js';

/** Injected so tests never touch the network. */
export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface Candidate {
  /** Which source produced this. */
  readonly sourceId: string;
  /**
   * Stable reference within the source, enough to fetch it again: a Commons
   * page title, a Met object id.
   */
  readonly ref: string;
  /** Display label, usually the work's title. */
  readonly title: string;
  /** Full-resolution image. */
  readonly url: string;
  /** Human-readable page about the work — what goes into `source`. */
  readonly pageUrl: string;
  /** Scaled preview for the results grid. */
  readonly thumbUrl: string;
  /** Zero when the source does not publish dimensions; see {@link sizeKnown}. */
  readonly width: number;
  readonly height: number;
  readonly mime: string;
  readonly credit: string;
  readonly license: string;
  /** True when the licence is one the tool will save. */
  readonly licenseAccepted: boolean;
  readonly restrictions: string;
  readonly description: string;
}

/** True when the source told us how big the file is. */
export function sizeKnown(candidate: Candidate): boolean {
  return candidate.width > 0 && candidate.height > 0;
}

/**
 * Whether a full-size crop fits, and what enlargement it would need.
 *
 * A source that does not publish dimensions is treated as usable and measured
 * for real when it is chosen — the crop is always checked against the actual
 * bytes before anything is written, so nothing rests on this.
 */
export function candidateFit(candidate: Candidate): {
  largeEnough: boolean;
  upscaleFactor: number;
} {
  if (!sizeKnown(candidate)) return { largeEnough: false, upscaleFactor: 1 };
  const factor = sourceUpscaleFactor({ width: candidate.width, height: candidate.height });
  return { largeEnough: factor <= 1, upscaleFactor: factor };
}

export interface SearchOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly excludeStructures?: boolean;
}

export interface SearchResult {
  readonly candidates: readonly Candidate[];
  /** Dropped because the licence could not be read or is not free. */
  readonly rejectedForLicense: number;
  /** Offset to pass back for the next page, or null when results ran out. */
  readonly nextOffset: number | null;
}

export interface ImageSource {
  readonly id: string;
  /** Shown in the source picker. */
  readonly label: string;
  /** Told to the curator when the source behaves unlike Commons. */
  readonly note?: string;
  search(fetcher: Fetcher, term: string, options: SearchOptions): Promise<SearchResult>;
  /** Re-reads one candidate by its {@link Candidate.ref}. */
  byRef(fetcher: Fetcher, ref: string, thumbWidth?: number): Promise<Candidate | null>;
}
