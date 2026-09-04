/**
 * Image sources.
 *
 * The Met's live API is unreachable from CI, as Commons' is, so its request
 * shape and its licence handling are pinned against fixtures instead. Getting
 * these wrong is how the artwork filter shipped broken.
 */

import { describe, expect, it } from 'vitest';
import {
  candidateFit,
  commonsSource,
  metSource,
  sizeKnown,
  sourceById,
  SOURCES,
  type Fetcher,
} from '../src/curate/sources/index.js';

const json = (body: unknown): Awaited<ReturnType<Fetcher>> => ({
  ok: true,
  status: 200,
  json: async () => body,
});

/** A Met object as the API returns it. */
function metObject(overrides: Record<string, unknown> = {}) {
  return {
    objectID: 436575,
    title: 'Saint Gregory',
    primaryImage: 'https://images.metmuseum.org/full/DP123.jpg',
    primaryImageSmall: 'https://images.metmuseum.org/small/DP123.jpg',
    objectURL: 'https://www.metmuseum.org/art/collection/search/436575',
    isPublicDomain: true,
    artistDisplayName: 'Francisco de Goya',
    objectDate: '1796–99',
    medium: 'Oil on canvas',
    department: 'European Paintings',
    ...overrides,
  };
}

/** Serves a search page then the objects it names. */
function metFetcher(objects: Record<string, unknown>[], seen: string[] = []): Fetcher {
  return async (url) => {
    seen.push(url);
    if (url.includes('/search?')) {
      return json({ total: objects.length, objectIDs: objects.map((o) => o['objectID']) });
    }
    const id = Number(url.split('/objects/')[1]);
    return json(objects.find((o) => o['objectID'] === id) ?? {});
  };
}

describe('the source registry', () => {
  it('offers Commons and the Met, Commons first', () => {
    expect(SOURCES.map((s) => s.id)).toEqual(['commons', 'met']);
  });

  it('falls back to Commons for an unknown or missing id', () => {
    expect(sourceById('nonsense').id).toBe('commons');
    expect(sourceById(null).id).toBe('commons');
    expect(sourceById('met').id).toBe('met');
  });
});

describe('the Met adapter', () => {
  it('asks only for open-access objects with images', async () => {
    const seen: string[] = [];
    await metSource.search(metFetcher([metObject()], seen), 'Gregory', {});
    const search = new URL(seen[0] as string);
    expect(search.origin + search.pathname).toBe(
      'https://collectionapi.metmuseum.org/public/collection/v1/search',
    );
    expect(search.searchParams.get('q')).toBe('Gregory');
    expect(search.searchParams.get('hasImages')).toBe('true');
    expect(search.searchParams.get('isPublicDomain')).toBe('true');
    expect(search.searchParams.get('medium')).toContain('Paintings');
    // Search returns ids only, so each result costs a second request.
    expect(seen[1]).toContain('/objects/436575');
  });

  it('derives credit and source from the object, never from the client', async () => {
    const result = await metSource.search(metFetcher([metObject()]), 'x', {});
    const [candidate] = result.candidates;
    expect(candidate?.sourceId).toBe('met');
    expect(candidate?.ref).toBe('436575');
    expect(candidate?.credit).toBe('Francisco de Goya, 1796–99');
    expect(candidate?.license).toMatch(/CC0/);
    expect(candidate?.pageUrl).toBe('https://www.metmuseum.org/art/collection/search/436575');
    expect(candidate?.url).toBe('https://images.metmuseum.org/full/DP123.jpg');
  });

  it('drops anything not flagged public domain', async () => {
    const result = await metSource.search(
      metFetcher([metObject(), metObject({ objectID: 2, isPublicDomain: false })]),
      'x',
      {},
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.rejectedForLicense).toBe(1);
  });

  it('skips objects with no image at all', async () => {
    const result = await metSource.search(metFetcher([metObject({ primaryImage: '' })]), 'x', {});
    expect(result.candidates).toHaveLength(0);
  });

  it('reports no dimensions, because the Met publishes none', async () => {
    const result = await metSource.search(metFetcher([metObject()]), 'x', {});
    const [candidate] = result.candidates;
    expect(candidate && sizeKnown(candidate)).toBe(false);
    // So it is offered rather than judged; the real check is on the bytes.
    expect(candidate && candidateFit(candidate).largeEnough).toBe(false);
  });

  it('pages through the id list', async () => {
    const objects = Array.from({ length: 30 }, (_, i) => metObject({ objectID: i + 1 }));
    const first = await metSource.search(metFetcher(objects), 'x', { limit: 12 });
    expect(first.candidates).toHaveLength(12);
    expect(first.nextOffset).toBe(12);

    const last = await metSource.search(metFetcher(objects), 'x', { limit: 12, offset: 24 });
    expect(last.candidates).toHaveLength(6);
    expect(last.nextOffset).toBeNull();
  });

  it('re-reads one object by reference', async () => {
    const candidate = await metSource.byRef(metFetcher([metObject()]), '436575');
    expect(candidate?.title).toBe('Saint Gregory');
  });

  it('surfaces a failed request rather than returning nothing', async () => {
    const fetcher: Fetcher = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(metSource.search(fetcher, 'x', {})).rejects.toThrow(/503/);
  });
});

describe('the Commons adapter', () => {
  it('normalises a Commons file into a candidate', async () => {
    const fetcher: Fetcher = async () =>
      json({
        query: {
          pages: [
            {
              title: 'File:Example.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/x.jpg',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
                  thumburl: 'https://upload.wikimedia.org/t.jpg',
                  width: 2000,
                  height: 4400,
                  mime: 'image/jpeg',
                  extmetadata: {
                    License: { value: 'pd' },
                    LicenseShortName: { value: 'Public domain' },
                  },
                },
              ],
            },
          ],
        },
      });

    const result = await commonsSource.search(fetcher, 'x', {});
    const [candidate] = result.candidates;
    expect(candidate?.sourceId).toBe('commons');
    // The ref is what byRef takes back, so it stays the page title.
    expect(candidate?.ref).toBe('File:Example.jpg');
    expect(candidate?.title).toBe('Example.jpg');
    expect(candidate?.pageUrl).toBe('https://commons.wikimedia.org/wiki/File:Example.jpg');
    expect(candidate && sizeKnown(candidate)).toBe(true);
    expect(candidate && candidateFit(candidate).largeEnough).toBe(true);
  });
});
