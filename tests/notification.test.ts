/**
 * The day's notification line.
 *
 * Derived where a saint can be addressed directly, curated everywhere else. A
 * wrong line is worse than none, so the derivation is deliberately narrow.
 */

import { describe, expect, it } from 'vitest';
import { defaultNotification, resolveNotification } from '../src/emit/notification.js';
import type { Subject } from '../src/emit/subject.js';

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: 'x',
  name: 'Saint N.',
  isFallback: false,
  isSanctoral: true,
  source: 'proper',
  kind: 'saint',
  admitsSaint: true,
  ...over,
});

describe('the derived line', () => {
  it('addresses a saint', () => {
    expect(defaultNotification(subject(), 'St. Gregory the Great')).toBe(
      'St. Gregory the Great, pray for us!',
    );
    expect(defaultNotification(subject(), 'Saint John Bosco')).toBe(
      'Saint John Bosco, pray for us!',
    );
    expect(defaultNotification(subject(), 'Blessed Pier Giorgio Frassati')).toBe(
      'Blessed Pier Giorgio Frassati, pray for us!',
    );
  });

  it('addresses Our Lady under a title, though she is modelled as a feast', () => {
    expect(defaultNotification(subject({ kind: 'feast' }), 'Our Lady of Sorrows')).toBe(
      'Our Lady of Sorrows, pray for us!',
    );
  });

  it('says nothing on a temporal day', () => {
    // "The Baptism of the Lord, pray for us!" is wrong, and no line is better
    // than a wrong one.
    expect(defaultNotification(subject({ isSanctoral: false, kind: 'day' }), 'Easter Sunday')).toBe(
      '',
    );
  });

  it('addresses a saint whatever the name looks like', () => {
    // kind comes from romcal's canonization level, so a name with no
    // honorific still derives.
    expect(defaultNotification(subject(), 'Cornelius and Cyprian')).toBe(
      'Cornelius and Cyprian, pray for us!',
    );
  });

  it('says nothing for a feast that commemorates an event', () => {
    // In the martyrology, but not a person: romcal leaves the canonization
    // level unset, so kind is `feast` and there is no one to address.
    const feast = subject({ kind: 'feast' });
    expect(defaultNotification(feast, 'The Nativity of the Blessed Virgin Mary')).toBe('');
    expect(defaultNotification(feast, 'The Exaltation of the Holy Cross')).toBe('');
    expect(defaultNotification(feast, 'All Saints')).toBe('');
  });

  it('says nothing for an empty name', () => {
    expect(defaultNotification(subject(), '   ')).toBe('');
  });
});

describe('resolving against a curated override', () => {
  it('prefers what the curator wrote', () => {
    expect(resolveNotification(subject(), 'St. Gregory', 'Holy Father Gregory, pray for us!')).toBe(
      'Holy Father Gregory, pray for us!',
    );
  });

  it('falls back to the derived line when nothing is written', () => {
    expect(resolveNotification(subject(), 'St. Gregory', '')).toBe('St. Gregory, pray for us!');
    expect(resolveNotification(subject(), 'St. Gregory', undefined)).toBe(
      'St. Gregory, pray for us!',
    );
    expect(resolveNotification(subject(), 'St. Gregory', '   ')).toBe('St. Gregory, pray for us!');
  });

  it('lets a curator supply a line where nothing is derivable', () => {
    const temporal = subject({ isSanctoral: false, kind: 'day' });
    expect(resolveNotification(temporal, 'The Nativity of the Lord', 'Merry Christmas!')).toBe(
      'Merry Christmas!',
    );
  });

  it('trims what it stores', () => {
    expect(resolveNotification(subject(), 'x', '  Hello!  ')).toBe('Hello!');
  });
});
