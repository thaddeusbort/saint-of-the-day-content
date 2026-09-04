/**
 * Curation parsing and PR validation.
 *
 * What validation deliberately does NOT check: whether the image is actually
 * public domain, whether the licence string is true, or whether the blurb is
 * any good. Those are human judgement — see CONTRIBUTING.md.
 */

import { rm, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { parseSaintEntry, CurationError } from '../src/curation/schema.js';
import { loadCuration } from '../src/curation/loader.js';
import { validateCuration } from '../src/validate.js';
import { addCuratedSaint, makeCheckout } from './helpers.js';

const valid = {
  name: 'St. John Bosco',
  subtitle: '1815–1888',
  blurb: 'Turin priest who built schools and workshops for boys.',
  credit: 'Photograph, c. 1880',
  license: 'Public domain',
  source: 'https://commons.wikimedia.org/wiki/File:Don_Bosco.jpg',
  crop: { x: 0, y: 0, width: 1440, height: 3200 },
};

describe('the curation schema', () => {
  it('accepts a complete entry and takes the id from the filename', () => {
    const entry = parseSaintEntry('john-bosco-priest', 'saints/john-bosco-priest.yaml', valid);
    expect(entry.id).toBe('john-bosco-priest');
    expect(entry.name).toBe('St. John Bosco');
    expect(entry.crop.width).toBe(1440);
  });

  it('treats subtitle as the one optional field', () => {
    const entry = parseSaintEntry('x', 'saints/x.yaml', { ...valid, subtitle: undefined });
    expect(entry.subtitle).toBe('');
  });

  it.each(['name', 'blurb', 'credit', 'license', 'source'])('rejects an empty %s', (field) => {
    expect(() => parseSaintEntry('x', 'saints/x.yaml', { ...valid, [field]: '   ' })).toThrow(
      CurationError,
    );
  });

  it('rejects a source that is not an http(s) URL', () => {
    expect(() =>
      parseSaintEntry('x', 'saints/x.yaml', { ...valid, source: 'File:Don_Bosco.jpg' }),
    ).toThrow(/must be an http\(s\) URL/);
  });

  it('rejects a missing or malformed crop box', () => {
    expect(() => parseSaintEntry('x', 'saints/x.yaml', { ...valid, crop: undefined })).toThrow(
      /crop/,
    );
    expect(() =>
      parseSaintEntry('x', 'saints/x.yaml', { ...valid, crop: { ...valid.crop, width: -5 } }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      parseSaintEntry('x', 'saints/x.yaml', { ...valid, crop: { ...valid.crop, height: 0 } }),
    ).toThrow(/greater than zero/);
  });

  it('rejects an unknown field, so a typo is not silently ignored', () => {
    expect(() =>
      parseSaintEntry('x', 'saints/x.yaml', { ...valid, licence: 'Public domain' }),
    ).toThrow(/unknown field\(s\): licence/);
  });

  it('rejects a document that is not a mapping', () => {
    expect(() => parseSaintEntry('x', 'saints/x.yaml', ['a', 'b'])).toThrow(/YAML mapping/);
  });
});

describe('notification', () => {
  it('defaults to empty, meaning "use the derived line"', () => {
    expect(parseSaintEntry('x', 'saints/x.yaml', valid).notification).toBe('');
  });

  it('is read and trimmed when present', () => {
    const entry = parseSaintEntry('x', 'saints/x.yaml', {
      ...valid,
      notification: '  Merry Christmas!  ',
    });
    expect(entry.notification).toBe('Merry Christmas!');
  });

  it('rejects a non-string', () => {
    expect(() => parseSaintEntry('x', 'saints/x.yaml', { ...valid, notification: 42 })).toThrow(
      /must be a string/,
    );
  });
});

describe('allow_upscale', () => {
  it('defaults to off', () => {
    expect(parseSaintEntry('x', 'saints/x.yaml', valid).allowUpscale).toBe(false);
  });

  it('is read when present', () => {
    const entry = parseSaintEntry('x', 'saints/x.yaml', { ...valid, allow_upscale: true });
    expect(entry.allowUpscale).toBe(true);
  });

  it('rejects a non-boolean', () => {
    expect(() => parseSaintEntry('x', 'saints/x.yaml', { ...valid, allow_upscale: 'yes' })).toThrow(
      /must be true or false/,
    );
  });
});

describe('PR validation', () => {
  it('passes a well-formed saint', async () => {
    const root = await makeCheckout();
    try {
      await addCuratedSaint(root, 'john-bosco-priest');
      const report = await validateCuration(root);
      expect(report.problems).toEqual([]);
      expect(report.checked).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a crop box that would have to be upscaled, unless asked', async () => {
    const root = await makeCheckout();
    try {
      // 720x1600 needs exactly 2x, inside the cap but not permitted by default.
      await addCuratedSaint(root, 'small-crop', { crop: { x: 0, y: 0, width: 720, height: 1600 } });
      const report = await validateCuration(root);
      expect(report.problems.join('\n')).toMatch(/set `allow_upscale: true`/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts an enlarged crop when the entry allows it', async () => {
    const root = await makeCheckout();
    try {
      await addCuratedSaint(root, 'enlarged', {
        crop: { x: 0, y: 0, width: 720, height: 1600 },
        allow_upscale: true,
      });
      const report = await validateCuration(root);
      expect(report.problems).toEqual([]);
      expect(report.checked).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses an enlargement beyond the cap even when allowed', async () => {
    const root = await makeCheckout();
    try {
      // 3.2x, past MAX_UPSCALE.
      await addCuratedSaint(root, 'far-too-small', {
        crop: { x: 0, y: 0, width: 450, height: 1000 },
        allow_upscale: true,
      });
      const report = await validateCuration(root);
      expect(report.problems.join('\n')).toMatch(/beyond the 3x limit/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a crop box that runs off the edge of the original', async () => {
    const root = await makeCheckout();
    try {
      await addCuratedSaint(root, 'off-edge', {
        crop: { x: 900, y: 0, width: 1440, height: 3200 },
      });
      const report = await validateCuration(root);
      expect(report.problems.join('\n')).toMatch(/falls outside originals\/off-edge\.jpg/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports a YAML file with no original, and an original with no YAML', async () => {
    const root = await makeCheckout();
    try {
      await addCuratedSaint(root, 'has-both');
      await addCuratedSaint(root, 'no-image');
      await unlink(path.join(root, 'originals', 'no-image.jpg'));
      await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } })
        .jpeg()
        .toFile(path.join(root, 'originals', 'no-yaml.jpg'));

      const report = await validateCuration(root);
      const joined = report.problems.join('\n');
      expect(joined).toMatch(/saints\/no-image\.yaml has no matching image/);
      expect(joined).toMatch(/originals\/no-yaml\.jpg has no matching saints/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports invalid YAML with the file name', async () => {
    const root = await makeCheckout();
    try {
      await writeFile(path.join(root, 'saints', 'broken.yaml'), 'name: "unterminated\n', 'utf8');
      const report = await validateCuration(root);
      expect(report.problems.join('\n')).toMatch(/broken\.yaml/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('the curation loader', () => {
  it('finds nothing in an empty checkout rather than failing', async () => {
    const root = await makeCheckout();
    try {
      const curation = await loadCuration(path.join(root, 'saints'), path.join(root, 'originals'));
      expect(curation.saints.size).toBe(0);
      expect(curation.missingOriginals).toEqual([]);
      expect(curation.orphanedOriginals).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
