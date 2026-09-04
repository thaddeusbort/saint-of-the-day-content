/**
 * Choosing the day's subject.
 *
 * Roughly a fifth of days in the General Roman Calendar carry a proper
 * celebration of a saint. Another quarter carry a coinciding optional memorial
 * the day does not require. The rest — Sundays, ferial weekdays, temporal
 * solemnities such as Easter — commemorate no one in the martyrology at all.
 *
 * `is_fallback` distinguishes the first case from the other two, and means
 * exactly one thing: the liturgical day has no proper celebration of a saint,
 * so the pipeline chose the subject.
 */

import { LOWEST_PRIVILEGED_TABLE_RANK } from '../config.js';
import type { LiturgicalDay } from '../calendar/types.js';

/**
 * Where the subject came from.
 *
 * `proper`   the day's own celebration is this saint
 * `optional` a coinciding optional memorial the day does not require
 * `temporal` no saint was available, so the liturgical day stands in
 *
 * A fourth, `martyrology`, belongs here once there is a martyrology to draw
 * from; it would take the place of `temporal` on days that admit a saint.
 */
export type SubjectSource = 'proper' | 'optional' | 'temporal';

/**
 * What the subject is, as distinct from how it was chosen.
 *
 * `saint` a person or people — John Bosco, Peter and Paul
 * `feast` commemorated in the martyrology but not a person — the Nativity of
 *         the Blessed Virgin Mary, the Exaltation of the Holy Cross, All
 *         Saints, Our Lady of Sorrows
 * `day`   the liturgical day itself — Christmas, Easter, a Sunday, a feria
 *
 * Taken from romcal's canonization level rather than from the name, so it does
 * not depend on how a celebration happens to be worded.
 */
export type SubjectKind = 'saint' | 'feast' | 'day';

export interface Subject {
  /** Content id, used for `saints/{id}.yaml` and `img/{id}-{w}x{h}.jpg`. */
  readonly id: string;
  readonly name: string;
  readonly isFallback: boolean;
  /** True when the subject is a person in the martyrology, not a temporal day. */
  readonly isSanctoral: boolean;
  readonly source: SubjectSource;
  readonly kind: SubjectKind;
  /**
   * True when the liturgical day would admit a saint it does not itself
   * celebrate. False for the Triduum, the solemnities, the privileged Sundays
   * and the feasts of the Lord — Christmas Day is the Nativity, and nothing
   * should be put in front of it.
   */
  readonly admitsSaint: boolean;
}

export function resolveSubject(day: LiturgicalDay): Subject {
  const [principal, ...coinciding] = day.celebrations;
  if (!principal) {
    throw new Error(`no celebrations for ${day.date}`);
  }
  const admitsSaint = day.tableRank > LOWEST_PRIVILEGED_TABLE_RANK;

  // The day's own celebration is a saint's day.
  if (principal.isSanctoral) {
    return {
      id: principal.id,
      name: principal.name,
      isFallback: false,
      isSanctoral: true,
      source: 'proper',
      kind: principal.isPerson ? 'saint' : 'feast',
      admitsSaint,
    };
  }

  // An optional memorial coincides with a ferial day: a real saint is
  // available, but the day does not require keeping them. A privileged day
  // never reaches here — romcal does not put an optional memorial beside one.
  const optional = coinciding.find((celebration) => celebration.isSanctoral);
  if (optional && admitsSaint) {
    return {
      id: optional.id,
      name: optional.name,
      isFallback: true,
      isSanctoral: true,
      source: 'optional',
      kind: optional.isPerson ? 'saint' : 'feast',
      admitsSaint,
    };
  }

  // Nothing sanctoral available. The subject is the liturgical day itself — a
  // Sunday, a ferial weekday, or a solemnity of the Lord. The id is stable
  // across years, so a curated image for `easter-sunday` serves every Easter.
  return {
    id: principal.id,
    name: principal.name,
    isFallback: true,
    isSanctoral: false,
    source: 'temporal',
    kind: 'day',
    admitsSaint,
  };
}
