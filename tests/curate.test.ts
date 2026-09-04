/**
 * The curation tool.
 *
 * No network: the Commons client and the downloader are both injected, so
 * these tests exercise the licence assessment and the save path against
 * fixtures rather than against Wikimedia.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';
import {
  ARTWORK_CLAUSE,
  ARTWORK_QIDS,
  fileByTitle,
  isFreeLicense,
  search,
  type Fetcher,
} from '../src/curate/commons.js';
import { buildQueue, defaultQuery } from '../src/curate/queue.js';
import { saveCuratedSaint, SaveError, type Downloader } from '../src/curate/save.js';
import { parseSaintEntry } from '../src/curation/schema.js';
import { validateCuration } from '../src/validate.js';
import { addCuratedSaint, makeCheckout } from './helpers.js';

const TODAY = '2026-09-01';

/** A Commons imageinfo page, shaped as the API returns it. */
function page(overrides: Record<string, unknown> = {}, ext: Record<string, string> = {}) {
  const extmetadata: Record<string, unknown> = {
    License: { value: 'pd' },
    LicenseShortName: { value: 'Public domain' },
    Artist: { value: '<a href="/wiki/x">Giovanni Rossi</a>' },
    DateTimeOriginal: { value: 'c. 1880' },
    ImageDescription: { value: 'A portrait of the saint' },
    ...Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, { value: v }])),
  };
  return {
    title: 'File:Example.jpg',
    imageinfo: [
      {
        url: 'https://upload.wikimedia.org/example.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
        thumburl: 'https://upload.wikimedia.org/thumb/example.jpg',
        width: 2000,
        height: 4000,
        mime: 'image/jpeg',
        extmetadata,
        ...overrides,
      },
    ],
  };
}

const fetcherFor =
  (pages: unknown[]): Fetcher =>
  async () => ({
    ok: true,
    status: 200,
    json: async () => ({ query: { pages } }),
  });

describe('licence assessment', () => {
  it('accepts public domain and the free Creative Commons licences', () => {
    expect(isFreeLicense('pd', 'Public domain')).toBe(true);
    expect(isFreeLicense('cc0', 'CC0')).toBe(true);
    expect(isFreeLicense('cc-by-sa-4.0', 'CC BY-SA 4.0')).toBe(true);
    expect(isFreeLicense('cc-by-3.0', 'CC BY 3.0')).toBe(true);
  });

  it('rejects the non-commercial and no-derivatives variants', () => {
    expect(isFreeLicense('cc-by-nc-4.0', 'CC BY-NC 4.0')).toBe(false);
    expect(isFreeLicense('cc-by-nd-4.0', 'CC BY-ND 4.0')).toBe(false);
  });

  it('rejects anything whose licence it cannot read', () => {
    expect(isFreeLicense('', '')).toBe(false);
    expect(isFreeLicense('', 'Fair use')).toBe(false);
    expect(isFreeLicense('proprietary', 'All rights reserved')).toBe(false);
  });

  it('falls back to the name only for unambiguous public domain wording', () => {
    expect(isFreeLicense('', 'Public domain')).toBe(true);
  });
});

describe('Commons search', () => {
  it('derives credit and source from the file, and strips the metadata HTML', async () => {
    const result = await search(fetcherFor([page()]), 'anything');
    const file = result.files[0];
    expect(file?.credit).toBe('Giovanni Rossi, c. 1880');
    expect(file?.license).toBe('Public domain');
    expect(file?.source ?? file?.descriptionUrl).toBe(
      'https://commons.wikimedia.org/wiki/File:Example.jpg',
    );
    expect(file?.description).toBe('A portrait of the saint');
  });

  it('drops files whose licence is not free, and counts them', async () => {
    const result = await search(
      fetcherFor([
        page(),
        page(
          { url: 'https://upload.wikimedia.org/nc.jpg' },
          { License: 'cc-by-nc-2.0', LicenseShortName: 'CC BY-NC 2.0' },
        ),
      ]),
      'anything',
    );
    expect(result.files).toHaveLength(1);
    expect(result.rejectedForLicense).toBe(1);
  });

  it('keeps images too small to crop but flags them', async () => {
    const result = await search(fetcherFor([page({ width: 800, height: 1200 })]), 'anything');
    expect(result.files[0]?.largeEnough).toBe(false);
  });

  it('sorts usable images ahead of unusable ones', async () => {
    const result = await search(
      fetcherFor([page({ width: 800, height: 1200 }), page({ width: 3000, height: 6000 })]),
      'anything',
    );
    expect(result.files[0]?.largeEnough).toBe(true);
    expect(result.files[1]?.largeEnough).toBe(false);
  });
});

describe('the request the Commons API actually receives', () => {
  // The live API cannot be reached from CI, so the request shape is pinned
  // here instead. A missing `action=query` returns help text rather than
  // results, and every parse downstream would silently yield nothing.
  async function captureUrl(run: (fetcher: Fetcher) => Promise<unknown>): Promise<URL> {
    let seen = '';
    const fetcher: Fetcher = async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }) };
    };
    await run(fetcher);
    return new URL(seen);
  }

  it('sends a well-formed search query', async () => {
    const url = await captureUrl((fetcher) => search(fetcher, 'John Bosco', { limit: 12 }));
    expect(url.origin + url.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(url.searchParams.get('action')).toBe('query');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('formatversion')).toBe('2');
    expect(url.searchParams.get('generator')).toBe('search');
    // Namespace 6 is File:, so the generator returns files rather than articles.
    expect(url.searchParams.get('gsrnamespace')).toBe('6');
    expect(url.searchParams.get('gsrsearch')).toContain('John Bosco');
    expect(url.searchParams.get('gsrlimit')).toBe('12');
    expect(url.searchParams.get('prop')).toBe('imageinfo');
    // extmetadata carries the licence and attribution this tool depends on.
    expect(url.searchParams.get('iiprop')?.split('|')).toContain('extmetadata');
    expect(url.searchParams.get('iiprop')?.split('|')).toContain('url');
    expect(url.searchParams.get('iiprop')?.split('|')).toContain('size');
  });

  it('sends a well-formed lookup by title', async () => {
    const url = await captureUrl((fetcher) => fileByTitle(fetcher, 'File:Don Bosco.jpg', 900));
    expect(url.searchParams.get('action')).toBe('query');
    expect(url.searchParams.get('titles')).toBe('File:Don Bosco.jpg');
    expect(url.searchParams.get('iiurlwidth')).toBe('900');
    expect(url.searchParams.get('iiprop')?.split('|')).toContain('extmetadata');
  });

  it('identifies itself, as Wikimedia asks API clients to', async () => {
    let headers: Record<string, string> | undefined;
    const fetcher: Fetcher = async (_url, init) => {
      headers = init?.headers;
      return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }) };
    };
    await search(fetcher, 'x');
    expect(headers?.['User-Agent']).toContain('saint-of-the-day-content');
  });

  it('surfaces a non-OK response rather than returning nothing', async () => {
    const fetcher: Fetcher = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await expect(search(fetcher, 'x')).rejects.toThrow(/429/);
  });
});

describe('the artwork filter', () => {
  async function queryFor(options: Parameters<typeof search>[2]): Promise<string> {
    let seen = '';
    const fetcher: Fetcher = async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }) };
    };
    await search(fetcher, 'John Bosco', options);
    return new URL(seen).searchParams.get('gsrsearch') ?? '';
  }

  it('is off unless asked for', async () => {
    const q = await queryFor({});
    expect(q).toBe('filetype:bitmap John Bosco');
    expect(q).not.toContain('haswbstatement');
  });

  it('narrows to the artwork types when asked', async () => {
    const q = await queryFor({ artworkOnly: true });
    // Structured data "instance of": painting, drawing, print, sculpture.
    expect(q).toContain('haswbstatement:P31=Q3305213');
    expect(q).toContain('haswbstatement:P31=Q93184');
    expect(q).toContain('haswbstatement:P31=Q11060274');
    expect(q).toContain('haswbstatement:P31=Q860861');
    // The clause is an OR group, so one match is enough, and the search term
    // still applies alongside it.
    expect(q).toMatch(/\(haswbstatement.*OR.*\)/);
    expect(q).toContain('John Bosco');
    expect(q.startsWith('filetype:bitmap ')).toBe(true);
  });

  it('builds the clause from the QID list, so the two cannot drift', () => {
    for (const qid of ARTWORK_QIDS) expect(ARTWORK_CLAUSE).toContain(`P31=${qid}`);
    expect(ARTWORK_CLAUSE.split(' OR ')).toHaveLength(ARTWORK_QIDS.length);
  });
});

describe('search queries', () => {
  it('strips honorifics and trailing titles', () => {
    expect(defaultQuery('Saint Gregory the Great, Pope and Doctor of the Church')).toBe(
      'Gregory the Great',
    );
    expect(defaultQuery('Saint John Bosco, Priest')).toBe('John Bosco');
    expect(defaultQuery('The Nativity of the Blessed Virgin Mary')).toBe(
      'Nativity of the Blessed Virgin Mary',
    );
  });
});

describe('the queue', () => {
  it('is sorted soonest first and grouped by subject', async () => {
    const root = await makeCheckout();
    try {
      const queue = await buildQueue({ root, today: TODAY, horizonDays: 60 });
      expect(queue.items.length).toBeGreaterThan(0);

      const dates = queue.items.map((item) => item.firstDate);
      expect([...dates]).toEqual([...dates].sort());
      expect(new Set(queue.items.map((i) => i.id)).size).toBe(queue.items.length);

      // Every date the subject occupies is recorded, and the first is soonest.
      for (const item of queue.items) {
        expect(item.dates[0]).toBe(item.firstDate);
        expect([...item.dates]).toEqual([...item.dates].sort());
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('separates saints from temporal days', async () => {
    const root = await makeCheckout();
    try {
      const queue = await buildQueue({ root, today: TODAY, horizonDays: 60 });
      const saints = queue.items.filter((i) => i.isSanctoral);
      const days = queue.items.filter((i) => !i.isSanctoral);
      expect(saints.length).toBeGreaterThan(0);
      expect(days.length).toBeGreaterThan(0);

      // 3 September 2026 is Saint Gregory the Great, a memorial.
      const gregory = queue.items.find((i) => i.firstDate === '2026-09-03');
      expect(gregory?.isSanctoral).toBe(true);
      expect(gregory?.isFallback).toBe(false);
      expect(gregory?.id).toBe('gregory-i-the-great-pope');

      // 6 September 2026 is a Sunday in Ordinary Time: nothing sanctoral.
      const sunday = queue.items.find((i) => i.firstDate === '2026-09-06');
      expect(sunday?.isSanctoral).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('marks a subject curated rather than dropping it, and carries its entry', async () => {
    const root = await makeCheckout();
    try {
      const before = await buildQueue({ root, today: TODAY, horizonDays: 60 });
      const uncurated = before.items.find((i) => i.id === 'gregory-i-the-great-pope');
      expect(uncurated?.curated).toBe(false);
      expect(uncurated?.entry).toBeUndefined();

      await addCuratedSaint(root, 'gregory-i-the-great-pope');
      const after = await buildQueue({ root, today: TODAY, horizonDays: 60 });
      const curated = after.items.find((i) => i.id === 'gregory-i-the-great-pope');

      // Still present, so the tool can show what has been done — the caller
      // decides whether to display it.
      expect(curated?.curated).toBe(true);
      expect(curated?.entry?.name).toBe('St. Test of Somewhere');
      expect(curated?.entry?.crop).toEqual({ x: 100, y: 200, width: 1440, height: 3200 });
      expect(curated?.entry?.original).toBe('gregory-i-the-great-pope.jpg');
      // Its dates and celebration are still resolved, so it reads like any
      // other row.
      expect(curated?.firstDate).toBe('2026-09-03');
      expect(after.curatedCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('search paging', () => {
  it('passes the offset through and reports where to continue', async () => {
    let seen = '';
    const fetcher: Fetcher = async (url) => {
      seen = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ continue: { gsroffset: 48 }, query: { pages: [page()] } }),
      };
    };
    const res = await search(fetcher, 'John Bosco', { limit: 24, offset: 24 });
    expect(new URL(seen).searchParams.get('gsroffset')).toBe('24');
    expect(res.nextOffset).toBe(48);
  });

  it('omits the offset on the first page', async () => {
    let seen = '';
    const fetcher: Fetcher = async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }) };
    };
    await search(fetcher, 'x');
    expect(new URL(seen).searchParams.has('gsroffset')).toBe(false);
  });

  it('stops paging when the results run out', async () => {
    // A short page with no continuation means there is nothing more to fetch.
    const res = await search(fetcherFor([page()]), 'x', { limit: 24 });
    expect(res.nextOffset).toBeNull();
  });

  it('falls back to counting a full page when no continuation is given', async () => {
    const full = Array.from({ length: 3 }, (_, i) => page({ url: `https://u/${i}.jpg` }));
    const res = await search(fetcherFor(full), 'x', { limit: 3 });
    expect(res.nextOffset).toBe(3);
  });
});

describe('saving', () => {
  const crop = { x: 100, y: 200, width: 1440, height: 3200 };

  async function jpegDownloader(width = 2000, height = 4000): Promise<Downloader> {
    const bytes = await sharp({
      create: { width, height, channels: 3, background: { r: 30, g: 60, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    return async () => bytes;
  }

  it('writes files that pass the repository’s own validation', async () => {
    const root = await makeCheckout();
    try {
      await saveCuratedSaint(
        {
          id: 'john-bosco-priest',
          name: 'St. John Bosco',
          years: '1815–1888',
          blurb: 'Turin priest who built schools and workshops for boys.',
          fileTitle: 'File:Example.jpg',
          crop,
        },
        { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
      );

      const yaml = await readFile(path.join(root, 'saints', 'john-bosco-priest.yaml'), 'utf8');
      const parsed = parseSaintEntry('john-bosco-priest', 'x.yaml', parseYaml(yaml));
      expect(parsed.name).toBe('St. John Bosco');
      // Attribution comes from Commons, not from the request.
      expect(parsed.credit).toBe('Giovanni Rossi, c. 1880');
      expect(parsed.license).toBe('Public domain');
      expect(parsed.source).toBe('https://commons.wikimedia.org/wiki/File:Example.jpg');

      // The same check CI runs must pass on what was just written.
      const report = await validateCuration(root);
      expect(report.problems).toEqual([]);
      expect(report.checked).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a licence it will not publish, and writes nothing', async () => {
    const root = await makeCheckout();
    try {
      await expect(
        saveCuratedSaint(
          { id: 'nope', name: 'X', years: '', blurb: 'b', fileTitle: 'File:Example.jpg', crop },
          {
            fetcher: fetcherFor([
              page({}, { License: 'cc-by-nc-2.0', LicenseShortName: 'CC BY-NC 2.0' }),
            ]),
            downloader: await jpegDownloader(),
            root,
          },
        ),
      ).rejects.toThrow(/Refusing to save/);

      const report = await validateCuration(root);
      expect(report.checked).toBe(0);
      expect(report.problems).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a crop that would need upscaling', async () => {
    const root = await makeCheckout();
    try {
      await expect(
        saveCuratedSaint(
          {
            id: 'small',
            name: 'X',
            years: '',
            blurb: 'b',
            fileTitle: 'File:Example.jpg',
            crop: { x: 0, y: 0, width: 900, height: 1950 },
          },
          { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
        ),
      ).rejects.toThrow(/smaller than the largest variant/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a crop that runs off the edge of the source', async () => {
    const root = await makeCheckout();
    try {
      await expect(
        saveCuratedSaint(
          {
            id: 'edge',
            name: 'X',
            years: '',
            blurb: 'b',
            fileTitle: 'File:Example.jpg',
            crop: { x: 1500, y: 0, width: 1440, height: 3200 },
          },
          { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
        ),
      ).rejects.toThrow(/falls outside/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an empty blurb, because the schema requires one', async () => {
    const root = await makeCheckout();
    try {
      await expect(
        saveCuratedSaint(
          {
            id: 'noblurb',
            name: 'X',
            years: '',
            blurb: '   ',
            fileTitle: 'File:Example.jpg',
            crop,
          },
          { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
        ),
      ).rejects.toThrow(/blurb/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports a Commons title that does not resolve', async () => {
    const root = await makeCheckout();
    try {
      await expect(
        saveCuratedSaint(
          { id: 'missing', name: 'X', years: '', blurb: 'b', fileTitle: 'File:Nope.jpg', crop },
          { fetcher: fetcherFor([]), downloader: await jpegDownloader(), root },
        ),
      ).rejects.toThrow(SaveError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('catches a source smaller than its metadata claimed', async () => {
    const root = await makeCheckout();
    try {
      // Commons says 2000x4000; the bytes are 1500x1600.
      await expect(
        saveCuratedSaint(
          { id: 'liar', name: 'X', years: '', blurb: 'b', fileTitle: 'File:Example.jpg', crop },
          { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(1500, 1600), root },
        ),
      ).rejects.toThrow(/falls outside/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('drops the existing renders so a re-crop actually takes effect', async () => {
    const root = await makeCheckout();
    try {
      const img = path.join(root, 'docs', 'v1', 'img');
      await mkdir(img, { recursive: true });
      // Stand in for a previous run's output. Renders are keyed by id and size
      // and are never rewritten, so leaving these would mean a new crop changed
      // the entry and nothing a device ever sees.
      for (const name of [
        'john-bosco-priest-1440x3200.jpg',
        'john-bosco-priest-1260x2800.jpg',
        'john-bosco-priest-1080x2400.jpg',
        'someone-else-1440x3200.jpg',
      ]) {
        await writeFile(path.join(img, name), 'stale');
      }

      const result = await saveCuratedSaint(
        {
          id: 'john-bosco-priest',
          name: 'St. John Bosco',
          years: '',
          blurb: 'A blurb.',
          fileTitle: 'File:Example.jpg',
          crop,
        },
        { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
      );

      expect(result.staleRenders).toBe(3);
      // Another subject's renders are untouched.
      expect((await readdir(img)).sort()).toEqual(['someone-else-1440x3200.jpg']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports no stale renders on a first save', async () => {
    const root = await makeCheckout();
    try {
      const result = await saveCuratedSaint(
        {
          id: 'fresh',
          name: 'X',
          years: '',
          blurb: 'b',
          fileTitle: 'File:Example.jpg',
          crop,
        },
        { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
      );
      expect(result.staleRenders).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  describe('a rejected save leaves nothing behind', () => {
    // A saint is two files or none. An original with no entry beside it is
    // worse than no saint at all: `npm run validate` reports it as orphaned, so
    // the failure surfaces later, in CI, on a pull request.
    async function expectNothingWritten(root: string): Promise<void> {
      expect(await readdir(path.join(root, 'originals'))).toEqual([]);
      expect(await readdir(path.join(root, 'saints'))).toEqual([]);
      const report = await validateCuration(root);
      expect(report.problems).toEqual([]);
      expect(report.checked).toBe(0);
    }

    it('when the served image is smaller than its metadata claimed', async () => {
      // The regression this suite exists for: the check against the real bytes
      // happens after the download, and used to happen after the write too.
      const root = await makeCheckout();
      try {
        await expect(
          saveCuratedSaint(
            { id: 'liar', name: 'X', years: '', blurb: 'b', fileTitle: 'File:Example.jpg', crop },
            { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(1500, 1600), root },
          ),
        ).rejects.toThrow(/falls outside/);
        await expectNothingWritten(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it('when the licence is refused', async () => {
      const root = await makeCheckout();
      try {
        await expect(
          saveCuratedSaint(
            { id: 'nc', name: 'X', years: '', blurb: 'b', fileTitle: 'File:Example.jpg', crop },
            {
              fetcher: fetcherFor([
                page({}, { License: 'cc-by-nc-2.0', LicenseShortName: 'CC BY-NC 2.0' }),
              ]),
              downloader: await jpegDownloader(),
              root,
            },
          ),
        ).rejects.toThrow(/Refusing to save/);
        await expectNothingWritten(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it('when the entry fails the schema', async () => {
      const root = await makeCheckout();
      try {
        await expect(
          saveCuratedSaint(
            {
              id: 'noblurb',
              name: 'X',
              years: '',
              blurb: '  ',
              fileTitle: 'File:Example.jpg',
              crop,
            },
            { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
          ),
        ).rejects.toThrow(/blurb/);
        await expectNothingWritten(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it('when the crop would need upscaling', async () => {
      const root = await makeCheckout();
      try {
        await expect(
          saveCuratedSaint(
            {
              id: 'tiny',
              name: 'X',
              years: '',
              blurb: 'b',
              fileTitle: 'File:Example.jpg',
              crop: { x: 0, y: 0, width: 900, height: 1950 },
            },
            { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
          ),
        ).rejects.toThrow(/smaller than the largest variant/);
        await expectNothingWritten(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it('takes the original back out when the entry cannot be written', async () => {
      const root = await makeCheckout();
      try {
        // A directory where the YAML file needs to go makes the write fail
        // after the original has already landed — the one ordering the
        // validate-first fix cannot rule out.
        await mkdir(path.join(root, 'saints', 'blocked.yaml'), { recursive: true });
        await expect(
          saveCuratedSaint(
            {
              id: 'blocked',
              name: 'X',
              years: '',
              blurb: 'b',
              fileTitle: 'File:Example.jpg',
              crop,
            },
            { fetcher: fetcherFor([page()]), downloader: await jpegDownloader(), root },
          ),
        ).rejects.toThrow();
        expect(await readdir(path.join(root, 'originals'))).toEqual([]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});

describe('fileByTitle', () => {
  it('returns null when the API has no such page', async () => {
    expect(await fileByTitle(fetcherFor([]), 'File:Nope.jpg')).toBeNull();
  });
});
