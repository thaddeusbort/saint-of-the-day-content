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

/**
 * romcal names each precedence after its place in the Table of Liturgical
 * Days: `TRIDUUM_1`, `GENERAL_SOLEMNITY_3`, `PROPER_FEAST_8F`, `WEEKDAY_13`.
 * The trailing number is that rank, and the optional letter distinguishes
 * entries sharing one. A precedence that does not carry one is a romcal change
 * this adapter has not seen, and fails loudly rather than scoring 0.
 */
const TABLE_RANK = /_(\d{1,2})[A-Z]?$/;

function toTableRank(precedence: string | undefined): number {
  const match = precedence === undefined ? null : TABLE_RANK.exec(precedence);
  const rank = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isInteger(rank) || rank < 1 || rank > 13) {
    throw new Error(`Unmapped romcal precedence: ${String(precedence)}`);
  }
  return rank;
}

function mapEnum<T>(
  table: Readonly<Record<string, T>>,
  value: string | undefined,
  what: string,
): T {
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
  precedence?: string;
  isOptional: boolean;
  seasons: readonly string[];
  colors: readonly string[];
  martyrology?: readonly { canonizationLevel?: string | null }[];
};

function toLiturgicalDay(date: string, entries: readonly RomcalEntry[]): LiturgicalDay {
  const principal = entries[0];
  if (!principal) {
    throw new Error(`romcal produced an empty celebration list for ${date}`);
  }

  // romcal's season list runs from the narrowest containing season to the
  // broadest, and the published label wants the broadest — so take the last.
  // This matters for exactly one day a year: Easter Sunday is
  // ["PASCHAL_TRIDUUM", "EASTER_TIME"], because the Triduum ends with Evening
  // Prayer that day (UNLY n. 19), and every published calendar lists it as the
  // first day of Easter Time rather than the last of the Triduum. Good Friday
  // and Holy Saturday are Triduum only and are unaffected.
  const season = mapEnum(SEASONS, principal.seasons.at(-1), 'season');

  // The colour list is not a hierarchy but a preference: Laetare Sunday is
  // ["ROSE", "PURPLE"] — rose may be used, else purple — and All Souls is
  // ["PURPLE", "BLACK"]. So here the first entry is the one to publish. An
  // unknown colour still fails loudly; only an absent one falls back.
  const rawColor = principal.colors[0];
  const color =
    rawColor === undefined ? SEASON_COLORS[season] : mapEnum(COLORS, rawColor, 'colour');

  return {
    date,
    tableRank: toTableRank(principal.precedence),
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
    isPerson: (entry.martyrology ?? []).some(
      (item) => typeof item?.canonizationLevel === 'string' && item.canonizationLevel !== '',
    ),
  };
}

/** Exposed for unit tests that map fixture entries without running romcal. */
export const __testing = { toLiturgicalDay, toCelebration, toTableRank };
