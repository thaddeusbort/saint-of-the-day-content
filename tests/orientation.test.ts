/**
 * EXIF orientation.
 *
 * A photograph stored sideways carries an orientation tag, and its *stored*
 * dimensions are the transpose of what anyone sees. Wikimedia reports the
 * displayed size, the curator frames a crop against that, and the renderer
 * must agree — otherwise a valid crop is rejected as out of bounds, or worse,
 * extracted from the wrong part of the picture.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { VARIANTS } from '../src/config.js';
import { imageSize, renderVariants } from '../src/render/images.js';

const LARGEST = VARIANTS[0];

/** 5184x3888 as stored; 3888x5184 as displayed. Orientation 6 is "rotate 90". */
async function sidewaysPhotograph(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 5184, height: 3888, channels: 3, background: { r: 60, g: 80, b: 100 } },
  })
    .jpeg()
    .toBuffer();
  return sharp(base).withMetadata({ orientation: 6 }).jpeg().toBuffer();
}

let dir: string;
let file: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'orient-'));
  file = path.join(dir, 'sideways.jpg');
  await writeFile(file, await sidewaysPhotograph());
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('imageSize', () => {
  it('reports the displayed size, not the stored size', async () => {
    // Stored is 5184x3888. Reporting that would make a portrait crop look
    // impossible and reject the image.
    expect(await imageSize(file)).toEqual({ width: 3888, height: 5184 });
  });

  it('is unaffected for an image with no orientation tag', async () => {
    const plain = path.join(dir, 'plain.jpg');
    await writeFile(
      plain,
      await sharp({ create: { width: 2000, height: 4000, channels: 3, background: '#333' } })
        .jpeg()
        .toBuffer(),
    );
    expect(await imageSize(plain)).toEqual({ width: 2000, height: 4000 });
  });
});

describe('rendering a sideways photograph', () => {
  it('extracts in the space the curator framed the crop in', async () => {
    // The crop the tool computes from the displayed 3888x5184: full height,
    // 20:9 wide, centred. Against the stored 5184x3888 this is out of bounds.
    const crop = { x: 748, y: 0, width: 2333, height: 5184 };
    expect(crop.height).toBeGreaterThan(3888);

    const result = await renderVariants({ id: 'sideways', sourcePath: file, crop }, dir);
    expect(result.rendered).toBe(VARIANTS.length);

    for (const { w, h } of VARIANTS) {
      const rendered = await sharp(path.join(dir, `sideways-${w}x${h}.jpg`)).metadata();
      expect([rendered.width, rendered.height]).toEqual([w, h]);
    }
  });

  it('renders the largest variant at exactly the frozen size', async () => {
    const meta = await sharp(path.join(dir, `sideways-${LARGEST.w}x${LARGEST.h}.jpg`)).metadata();
    expect(meta.width).toBe(LARGEST.w);
    expect(meta.height).toBe(LARGEST.h);
  });
});
