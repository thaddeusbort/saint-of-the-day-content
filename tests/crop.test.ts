/**
 * Crop geometry and the enlargement rule.
 *
 * Rendering does not upscale by default. The exception exists because large
 * files on Commons are overwhelmingly modern photographs while painting scans
 * are small, so the rule quietly selects against the artwork this project
 * wants — but it stays an exception, per entry and capped.
 */

import { describe, expect, it } from 'vitest';
import { MAX_UPSCALE, VARIANTS } from '../src/config.js';
import { judgeCrop, largestCropIn, minimumSource, sourceUpscaleFactor } from '../src/crop.js';

const LARGEST = VARIANTS[0];

describe('largestCropIn', () => {
  it('takes the full height of a portrait source', () => {
    // The case that prompted this: a 2:3 photograph of a painting.
    expect(largestCropIn({ width: 751, height: 1126 })).toEqual({ width: 507, height: 1126 });
  });

  it('is limited by width on a landscape source', () => {
    const crop = largestCropIn({ width: 5184, height: 3888 });
    expect(crop.height).toBe(3888);
    expect(crop.width).toBe(Math.round(3888 * (LARGEST.w / LARGEST.h)));
  });

  it('returns the render size itself from an exactly-sized source', () => {
    expect(largestCropIn({ width: LARGEST.w, height: LARGEST.h })).toEqual({
      width: LARGEST.w,
      height: LARGEST.h,
    });
  });
});

describe('sourceUpscaleFactor', () => {
  it('is 1 or less when the source is big enough', () => {
    expect(sourceUpscaleFactor({ width: 2826, height: 4974 })).toBeLessThanOrEqual(1);
  });

  it('reports the enlargement a small source needs', () => {
    // 507-wide crop from a 751x1126 source, against a 1440-wide render.
    expect(sourceUpscaleFactor({ width: 751, height: 1126 })).toBeCloseTo(1440 / 507, 2);
  });
});

describe('minimumSource', () => {
  it('is the render size divided by the cap', () => {
    expect(minimumSource()).toEqual({
      width: Math.ceil(LARGEST.w / MAX_UPSCALE),
      height: Math.ceil(LARGEST.h / MAX_UPSCALE),
    });
  });
});

describe('judgeCrop', () => {
  const full = { x: 0, y: 0, width: LARGEST.w, height: LARGEST.h };

  it('accepts a full-size crop without the opt-in', () => {
    expect(judgeCrop(full, false)).toEqual({ ok: true, factor: 1 });
  });

  it('accepts a larger-than-needed crop', () => {
    expect(judgeCrop({ x: 0, y: 0, width: 2880, height: 6400 }, false).ok).toBe(true);
  });

  it('refuses a small crop by default, and says how to permit it', () => {
    const verdict = judgeCrop({ x: 0, y: 0, width: 720, height: 1600 }, false);
    expect(verdict.ok).toBe(false);
    expect(verdict.factor).toBeCloseTo(2, 5);
    expect(verdict.reason).toMatch(/allow_upscale/);
  });

  it('accepts the same crop once the entry permits it', () => {
    const verdict = judgeCrop({ x: 0, y: 0, width: 720, height: 1600 }, true);
    expect(verdict.ok).toBe(true);
    expect(verdict.factor).toBeCloseTo(2, 5);
  });

  it('refuses beyond the cap however the entry is set', () => {
    // Just past 3x.
    const tiny = { x: 0, y: 0, width: 479, height: 1064 };
    expect(judgeCrop(tiny, true).ok).toBe(false);
    expect(judgeCrop(tiny, true).reason).toMatch(new RegExp(`beyond the ${MAX_UPSCALE}x limit`));
  });

  it('accepts exactly the cap', () => {
    const atCap = { x: 0, y: 0, width: LARGEST.w / MAX_UPSCALE, height: LARGEST.h / MAX_UPSCALE };
    const verdict = judgeCrop(atCap, true);
    expect(verdict.ok).toBe(true);
    expect(verdict.factor).toBeCloseTo(MAX_UPSCALE, 5);
  });

  it('lets the reported source through at its best crop', () => {
    // End to end for the file that started this: 751x1126 needs 2.84x, which
    // is inside the cap, so it is usable with the opt-in and not without.
    const crop = largestCropIn({ width: 751, height: 1126 });
    const box = { x: 0, y: 0, ...crop };
    expect(judgeCrop(box, false).ok).toBe(false);
    expect(judgeCrop(box, true).ok).toBe(true);
    expect(judgeCrop(box, true).factor).toBeCloseTo(2.84, 2);
  });
});
