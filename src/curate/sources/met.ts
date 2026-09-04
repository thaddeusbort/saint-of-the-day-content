/**
 * The Metropolitan Museum of Art collection.
 *
 * Commons holds what people have uploaded; the Met holds the museum's own
 * scans, which for a painting are usually far larger. It needs no API key and
 * publishes an explicit `isPublicDomain` flag, which is the only reason it can
 * be used here: as with Commons, the licence is read from the API and never
 * asserted by the client.
 *
 * Two things differ from Commons and are handled rather than hidden:
 *
 *  - Search returns object ids only, so each result costs a second request.
 *    That caps a page at a modest size.
 *  - Objects carry no image dimensions. Candidates come back with a size of
 *    zero and are measured for real when one is chosen, which is safe because
 *    the crop is always checked against the downloaded bytes before anything
 *    is written.
 *
 * https://metmuseum.github.io/
 */

import type { Candidate, Fetcher, ImageSource, SearchOptions, SearchResult } from './types.js';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';

/** The Met asks for no key, but identifying the client is still good manners. */
const USER_AGENT =
  'saint-of-the-day-content curation tool (https://github.com/thaddeusbort/saint-of-the-day-content)';

/**
 * Only open-access objects are offered.
 *
 * `isPublicDomain` covers the Met's own photograph as well as the work, which
 * is the thing that matters — a public-domain painting can still carry a
 * rights-reserved photograph at other institutions.
 */
function isOpenAccess(object: Record<string, unknown>): boolean {
  return object['isPublicDomain'] === true;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Met API returned ${response.status}`);
  return response.json();
}

function toCandidate(object: Record<string, unknown>): Candidate | null {
  const url = text(object['primaryImage']);
  const id = object['objectID'];
  if (url === '' || typeof id !== 'number') return null;

  const artist = text(object['artistDisplayName']);
  const date = text(object['objectDate']);
  const credit =
    [artist, date].filter((part) => part !== '').join(', ') || text(object['creditLine']);

  return {
    sourceId: 'met',
    ref: String(id),
    title: text(object['title']) || `Met object ${id}`,
    url,
    pageUrl: text(object['objectURL']) || `https://www.metmuseum.org/art/collection/search/${id}`,
    thumbUrl: text(object['primaryImageSmall']) || url,
    // The Met publishes no dimensions; measured on selection instead.
    width: 0,
    height: 0,
    // Nor a MIME type. Its images are JPEG, and the save path re-checks the
    // bytes it actually downloads.
    mime: 'image/jpeg',
    credit: credit === '' ? 'The Metropolitan Museum of Art' : credit,
    // CC0 is what the Met's open-access programme releases under.
    license: 'CC0 1.0 (Met Open Access)',
    licenseAccepted: isOpenAccess(object),
    restrictions: '',
    description: [text(object['medium']), text(object['department'])]
      .filter((part) => part !== '')
      .join(' · '),
  };
}

async function objectById(fetcher: Fetcher, id: string): Promise<Candidate | null> {
  const payload = await getJson(fetcher, `${API}/objects/${encodeURIComponent(id)}`);
  if (typeof payload !== 'object' || payload === null) return null;
  return toCandidate(payload as Record<string, unknown>);
}

export const metSource: ImageSource = {
  id: 'met',
  label: 'Met Museum',
  note: 'Open Access only. The Met publishes no image sizes, so results are measured when you pick one.',

  async search(fetcher: Fetcher, term: string, options: SearchOptions): Promise<SearchResult> {
    const limit = options.limit ?? 12;
    const offset = options.offset ?? 0;
    const params = new URLSearchParams({
      q: term,
      hasImages: 'true',
      isPublicDomain: 'true',
      // Paintings, drawings and prints — the Met's medium filter is a free
      // text match over its own vocabulary.
      medium: 'Paintings|Drawings|Prints',
    });
    const payload = await getJson(fetcher, `${API}/search?${params}`);

    const ids =
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as Record<string, unknown>)['objectIDs'])
        ? ((payload as Record<string, unknown>)['objectIDs'] as unknown[])
        : [];
    const page = ids
      .slice(offset, offset + limit)
      .filter((id): id is number => typeof id === 'number');

    const objects = await Promise.all(page.map((id) => objectById(fetcher, String(id))));
    const all = objects.filter((candidate): candidate is Candidate => candidate !== null);
    const candidates = all.filter((candidate) => candidate.licenseAccepted);

    return {
      candidates,
      rejectedForLicense: all.length - candidates.length,
      nextOffset: offset + limit < ids.length ? offset + limit : null,
    };
  },

  byRef(fetcher: Fetcher, ref: string): Promise<Candidate | null> {
    return objectById(fetcher, ref);
  },
};
