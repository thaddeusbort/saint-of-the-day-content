/**
 * The day's notification line.
 *
 * A short address to go with the image — "St. Gregory the Great, pray for us!"
 * — which differs in kind between a saint's day and a feast of the Lord.
 *
 * Derived where it can be, curated where it cannot. A saint takes the ordinary
 * invocation from their own name, so most days need nothing written. Temporal
 * days have no one to address and are left empty for a curator to fill: "Christ
 * is risen!" is not something to guess at from a celebration title.
 */

import type { Subject } from './subject.js';

/**
 * Names that can be addressed directly.
 *
 * Being in the martyrology is not enough: "The Nativity of the Blessed Virgin
 * Mary" commemorates an event, and "The Nativity of the Blessed Virgin Mary,
 * pray for us!" is simply wrong. A name that opens with an honorific is a
 * person — or Our Lady under a title, where the invocation is right — and
 * anything else is left for a curator.
 */
// The prefix must be followed by whitespace, not a word boundary: `\b` after
// a literal full stop never matches, which silently excluded "St. Gregory" —
// the commonest form a curator writes.
const ADDRESSABLE = /^(Saints?|St\.|Blessed|Bl\.|Our Lady)(\s|$)/i;

/** How a saint is addressed when nothing else is written. */
export function defaultNotification(subject: Subject, displayName: string): string {
  // Only a person is addressed this way. "The Baptism of the Lord, pray for
  // us!" is wrong, and a bad line is worse than none.
  if (!subject.isSanctoral) return '';
  const name = displayName.trim();
  if (name === '' || !ADDRESSABLE.test(name)) return '';
  return `${name}, pray for us!`;
}

/**
 * The line to publish: the curator's if they wrote one, else the derived one.
 *
 * Deliberately not clever about romcal's names. "Saints Cornelius, Pope, and
 * Cyprian, Bishop, Martyrs, pray for us!" is clumsy, and trimming titles off a
 * compound name is exactly the sort of guess that goes wrong quietly — the
 * curated `name` is already short, and the override exists for the rest.
 */
export function resolveNotification(
  subject: Subject,
  displayName: string,
  curated: string | undefined,
): string {
  const written = curated?.trim() ?? '';
  return written === '' ? defaultNotification(subject, displayName) : written;
}
