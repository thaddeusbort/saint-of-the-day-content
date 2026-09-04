/**
 * Wikimedia Commons as an {@link ImageSource}.
 *
 * A thin adapter over `src/curate/commons.ts`, which keeps the CirrusSearch
 * and licence logic. Commons remains the default source: it publishes image
 * dimensions, so results can be judged before they are opened.
 */

import { fileByTitle, search as commonsSearch, type CommonsFile } from '../commons.js';
import type { Candidate, Fetcher, ImageSource, SearchOptions, SearchResult } from './types.js';

function toCandidate(file: CommonsFile): Candidate {
  return {
    sourceId: 'commons',
    ref: file.title,
    title: file.title.replace(/^File:/, ''),
    url: file.url,
    pageUrl: file.descriptionUrl,
    thumbUrl: file.thumbUrl,
    width: file.width,
    height: file.height,
    mime: file.mime,
    credit: file.credit === '' ? 'Wikimedia Commons' : file.credit,
    license: file.license,
    licenseAccepted: file.licenseAccepted,
    restrictions: file.restrictions,
    description: file.description,
  };
}

export const commonsSource: ImageSource = {
  id: 'commons',
  label: 'Wikimedia Commons',

  async search(fetcher: Fetcher, term: string, options: SearchOptions): Promise<SearchResult> {
    const result = await commonsSearch(fetcher, term, options);
    return {
      candidates: result.files.map(toCandidate),
      rejectedForLicense: result.rejectedForLicense,
      nextOffset: result.nextOffset,
    };
  },

  async byRef(fetcher: Fetcher, ref: string, thumbWidth?: number): Promise<Candidate | null> {
    const file = await fileByTitle(fetcher, ref, thumbWidth);
    return file === null ? null : toCandidate(file);
  },
};
