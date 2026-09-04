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
 * Marian titles.
 *
 * romcal models "Our Lady of Sorrows" as a commemoration rather than a person,
 * so it is a `feast` — but it is still addressed the same way, and this is the
 * one place a name has to be read rather than a field.
 */
const OUR_LADY = /^Our Lady\b/i;

/** How a subject is addressed when nothing else is written. */
export function defaultNotification(subject: Subject, displayName: string): string {
  const name = displayName.trim();
  if (name === '') return '';
  // A person is addressed directly. `kind` comes from romcal's canonization
  // level, so this no longer depends on how the name happens to be worded.
  if (subject.kind === 'saint') return `${name}, pray for us!`;
  if (subject.kind === 'feast' && OUR_LADY.test(name)) return `${name}, pray for us!`;
  // An event or a temporal day has no one to address. "The Baptism of the
  // Lord, pray for us!" is wrong, and a bad line is worse than none.
  return '';
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
