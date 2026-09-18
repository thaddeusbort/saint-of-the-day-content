/**
 * Saints used when the General Roman Calendar supplies no sanctoral subject.
 *
 * Keys are month and day so an entry recurs every year. The subject resolver
 * still gives the day's proper celebration and coinciding optional memorials
 * priority, and it ignores this registry on privileged days.
 */

export interface MartyrologyEntry {
  readonly id: string;
  readonly name: string;
}

const ENTRIES: Readonly<Record<string, MartyrologyEntry>> = {
  '09-18': {
    id: 'joseph-of-cupertino-priest',
    name: 'Saint Joseph of Cupertino, Priest',
  },
};

/** Returns the martyrology subject for an ISO date, when one is registered. */
export function martyrologyEntry(date: string): MartyrologyEntry | undefined {
  return ENTRIES[date.slice(5)];
}
