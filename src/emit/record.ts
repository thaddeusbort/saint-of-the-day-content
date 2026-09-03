/**
 * The published day record — the app's data contract.
 *
 * The app ignores unknown keys, so adding a field is safe. Renaming or
 * removing one breaks every installed version, which is what `schema` and the
 * `v1/` path segment exist to prevent. `saint` and `image` are the only fields
 * with no default in the app's model: a day missing either fails to parse.
 */

export interface ImageVariant {
  readonly w: number;
  readonly h: number;
  /** Relative to `v1/` — the app joins it onto `{BASE_URL}/v1/`. */
  readonly url: string;
}

export interface SaintRecord {
  readonly id: string;
  readonly name: string;
  readonly years: string;
  readonly blurb: string;
  /**
   * True when the liturgical day has no proper celebration of a saint, so the
   * pipeline chose one. Nothing else.
   */
  readonly is_fallback: boolean;
  /**
   * Why this subject was chosen: `proper` for the day's own celebration,
   * `optional` for a coinciding optional memorial, `temporal` when no saint
   * was available and the liturgical day stands in.
   *
   * The app has no default for unknown keys but ignores them, so this is
   * additive. It exists so a reader can tell a memorial the day requires from
   * one the pipeline reached for.
   */
  readonly source: string;
}

export interface ImageRecord {
  readonly credit: string;
  readonly license: string;
  readonly source: string;
  /**
   * True when this is a generic liturgical-colour plate rather than a curated
   * image. The app ignores it; the worklist generator reads it.
   */
  readonly is_placeholder: boolean;
  readonly variants: readonly ImageVariant[];
}

export interface DayRecord {
  readonly schema: number;
  readonly date: string;
  readonly season: string;
  readonly color: string;
  readonly rank: string;
  readonly celebration: string;
  readonly all_celebrations: readonly string[];
  readonly saint: SaintRecord;
  readonly image: ImageRecord;
}
