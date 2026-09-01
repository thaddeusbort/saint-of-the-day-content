/**
 * The romcal adapter — the single module allowed to import romcal.
 *
 * romcal's vocabulary (SCREAMING_SNAKE ranks, `PURPLE`, `ORDINARY_TIME`,
 * `EASTER_TIME`) is mapped here onto the pipeline's own vocabulary. Everything
 * downstream sees only `src/calendar/types.ts`.
 */

import { Romcal } from 'romcal';
import { GeneralRoman_En } from '@romcal/calendar.general-roman';
import type { Celebration, Color, LiturgicalDay, Rank, Season } from './types.js';

const SEASONS: Readonly<Record<string, Season>> = {
  ADVENT: 'advent',
  CHRISTMAS_TIME: 'christmas',
  LENT: 'lent',
  PASCHAL_TRIDUUM: 'triduum',
  EASTER_TIME: 'easter',
  ORDINARY_TIME: 'ordinary',
};

const COLORS: Readonly<Record<string, Color>> = {
  WHITE: 'white',
  RED: 'red',
  GREEN: 'green',
  // The Roman Rite's Lent/Advent colour is `PURPLE` in romcal and "violet" in
  // English liturgical usage. The fallback plate is named to match.
  PURPLE: 'violet',
  ROSE: 'rose',
  BLACK: 'black',
};

/**
 * Colour of last resort, by season.
 *
 * romcal leaves `colors` empty for a celebration that is kept in the colour of
 * the day rather than its own. For coinciding memorials in Lent, Advent and
 * Christmas Time that is irrelevant — only the principal celebration sets the
 * day's colour. It matters for exactly one principal celebration: Holy
 * Saturday, which has no liturgy, and so no proper colour, until the Easter
 * Vigil — which is white.
 */
const SEASON_COLORS: Readonly<Record<Season, Color>> = {
  advent: 'violet',
  christmas: 'white',
  lent: 'violet',
  triduum: 'white',
  easter: 'white',
  ordinary: 'green',
};

const RANKS: Readonly<Record<string, Rank>> = {
  SOLEMNITY: 'solemnity',
  FEAST: 'feast',
  MEMORIAL: 'memorial',
  OPTIONAL_MEMORIAL: 'optional_memorial',
  SUNDAY: 'sunday',
  WEEKDAY: 'weekday',
};

function mapEnum<T>(table: Readonly<Record<string, T>>, value: string | undefined, what: string): T {
  const mapped = value === undefined ? undefined : table[value];
  if (mapped === undefined) {
    // A romcal upgrade that introduces a new season, colour or rank must fail
    // loudly here rather than silently publishing an empty field.
    throw new Error(`Unmapped romcal ${what}: ${String(value)}`);
  }
  return mapped;
}

/** `john_bosco_priest` -> `john-bosco-priest`. */
export function toContentId(romcalId: string): string {
  return romcalId.replaceAll('_', '-');
}

/**
 * Resolves liturgical days by date, one romcal year at a time.
 *
 * romcal computes a whole year per call, so years are cached: a 408-day window
 * spans at most three of them.
 */
export class LiturgicalCalendar {
  readonly #romcal: Romcal;
  readonly #years = new Map<number, Map<string, LiturgicalDay>>();

  constructor() {
    this.#romcal = new Romcal({
      localizedCalendar: GeneralRoman_En,
      scope: 'gregorian',
    });
  }

  /** romcal version actually in use, for diagnostics. */
  static version(): string {
    return Romcal.getVersion();
  }

  async day(date: string): Promise<LiturgicalDay> {
    const year = Number(date.slice(0, 4));
    const days = await this.#year(year);
    const day = days.get(date);
    if (!day) {
      throw new Error(`romcal produced no liturgical day for ${date}`);
    }
    return day;
  }

  async #year(year: number): Promise<Map<string, LiturgicalDay>> {
    const cached = this.#years.get(year);
    if (cached) return cached;

    const calendar = await this.#romcal.generateCalendar(year);
    const days = new Map<string, LiturgicalDay>();
    for (const [date, entries] of Object.entries(calendar)) {
      days.set(date, toLiturgicalDay(date, entries));
    }
    this.#years.set(year, days);
    return days;
  }
}

type RomcalEntry = {
  id: string;
  name: string;
  rank: string;
  isOptional: boolean;
  seasons: readonly string[];
  colors: readonly string[];
  martyrology?: readonly unknown[];
};

function toLiturgicalDay(date: string, entries: readonly RomcalEntry[]): LiturgicalDay {
  const principal = entries[0];
  if (!principal) {
    throw new Error(`romcal produced an empty celebration list for ${date}`);
  }

  // romcal lists the most specific season first: the Paschal Triduum days
  // carry ["PASCHAL_TRIDUUM", "EASTER_TIME"].
  const season = mapEnum(SEASONS, principal.seasons[0], 'season');

  // Likewise the first colour is the one the day is actually kept in: Laetare
  // Sunday is ["ROSE", "PURPLE"], All Souls is ["PURPLE", "BLACK"]. An unknown
  // colour still fails loudly; only an absent one falls back to the season.
  const rawColor = principal.colors[0];
  const color = rawColor === undefined ? SEASON_COLORS[season] : mapEnum(COLORS, rawColor, 'colour');

  return {
    date,
    season,
    color,
    rank: mapEnum(RANKS, principal.rank, 'rank'),
    celebrations: entries.map(toCelebration),
  };
}

function toCelebration(entry: RomcalEntry): Celebration {
  return {
    id: toContentId(entry.id),
    name: entry.name,
    rank: mapEnum(RANKS, entry.rank, 'rank'),
    isOptional: entry.isOptional === true,
    isSanctoral: (entry.martyrology?.length ?? 0) > 0,
  };
}

/** Exposed for unit tests that map fixture entries without running romcal. */
export const __testing = { toLiturgicalDay, toCelebration };
