/**
 * The pipeline's own liturgical vocabulary.
 *
 * Nothing outside `src/calendar/adapter.ts` may import romcal. If the calendar
 * dependency is ever swapped, the adapter is the only module that changes.
 */

export type Season = 'advent' | 'christmas' | 'lent' | 'triduum' | 'easter' | 'ordinary';

export type Color = 'white' | 'red' | 'green' | 'violet' | 'rose' | 'black';

export type Rank = 'solemnity' | 'feast' | 'memorial' | 'optional_memorial' | 'sunday' | 'weekday';

/** One celebration occurring on a date. */
export interface Celebration {
  /** Stable romcal identifier, hyphenated (e.g. `john-bosco-priest`). */
  readonly id: string;
  /** Display name, e.g. "Saint John Bosco, Priest". */
  readonly name: string;
  readonly rank: Rank;
  /** True when the celebration is an optional memorial the day does not require. */
  readonly isOptional: boolean;
  /**
   * True when the celebration commemorates anything in the martyrology — a
   * person, but also an event or a title.
   */
  readonly isSanctoral: boolean;
  /**
   * True when what it commemorates is a person.
   *
   * romcal marks people with a canonization level and leaves it unset for
   * events and titles, so "Saint John Bosco" is a person while "The Nativity
   * of the Blessed Virgin Mary" and "Our Lady of Sorrows" are not. That
   * distinction is structural, not a guess from the name.
   */
  readonly isPerson: boolean;
}

/** Everything the pipeline needs to know about one calendar date. */
export interface LiturgicalDay {
  /**
   * Position in the Table of Liturgical Days (UNLY nn. 59-61), 1 for the
   * Paschal Triduum down to 13 for a ferial weekday.
   *
   * Rank distinguishes a solemnity from a memorial; this distinguishes a
   * Sunday of Lent from a Sunday in Ordinary Time, and Holy Week from an
   * ordinary weekday — the axis that decides whether a day will admit any
   * celebration but its own.
   */
  readonly tableRank: number;
  /** ISO date, `yyyy-MM-dd`. */
  readonly date: string;
  readonly season: Season;
  readonly color: Color;
  readonly rank: Rank;
  /**
   * Every celebration falling on this date, principal celebration first,
   * then coinciding optional memorials in romcal's order.
   */
  readonly celebrations: readonly Celebration[];
}
