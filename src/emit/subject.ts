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

import type { LiturgicalDay } from '../calendar/types.js';

export interface Subject {
  /** Content id, used for `saints/{id}.yaml` and `img/{id}-{w}x{h}.jpg`. */
  readonly id: string;
  readonly name: string;
  readonly isFallback: boolean;
  /** True when the subject is a person in the martyrology, not a temporal day. */
  readonly isSanctoral: boolean;
}

export function resolveSubject(day: LiturgicalDay): Subject {
  const [principal, ...coinciding] = day.celebrations;
  if (!principal) {
    throw new Error(`no celebrations for ${day.date}`);
  }

  // The day's own celebration is a saint's day.
  if (principal.isSanctoral) {
    return { id: principal.id, name: principal.name, isFallback: false, isSanctoral: true };
  }

  // An optional memorial coincides with a ferial day: a real saint is
  // available, but the day does not require keeping them.
  const optional = coinciding.find((celebration) => celebration.isSanctoral);
  if (optional) {
    return { id: optional.id, name: optional.name, isFallback: true, isSanctoral: true };
  }

  // Nothing sanctoral at all. The subject is the liturgical day itself — a
  // Sunday, a ferial weekday, or a solemnity of the Lord. The id is stable
  // across years, so a curated image for `easter-sunday` serves every Easter.
  return { id: principal.id, name: principal.name, isFallback: true, isSanctoral: false };
}
