/**
 * Generates the generic liturgical-colour plates.
 *
 * These are the images every uncurated day falls back to, so they ship before
 * any saint does: coverage is complete from day one with zero saints curated,
 * and every saint added afterwards is a strict improvement.
 *
 * The plates are written to `fallbacks/` and committed. This module is a
 * one-off authoring tool, not part of a normal run — regenerating a plate that
 * has already been rendered into `docs/v1/img/` would have no effect there,
 * because rendered blobs are never rewritten.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { FALLBACK_COLORS, JPEG_OPTIONS, VARIANTS, type FallbackColor } from '../config.js';

/** Plates are authored at the largest variant size, so nothing is ever upscaled. */
const PLATE = VARIANTS[0];

/** Top and bottom of each plate's vertical gradient, and its highlight tint. */
const PALETTE: Readonly<Record<FallbackColor, { top: string; bottom: string; glow: string }>> = {
  white: { top: '#f2ece1', bottom: '#b9ab92', glow: '#fffaf0' },
  red: { top: '#8c1c1c', bottom: '#3d0a0a', glow: '#d4574f' },
  green: { top: '#1f5136', bottom: '#0b2318', glow: '#5ea87c' },
  violet: { top: '#432b63', bottom: '#181029', glow: '#8a6bb5' },
  rose: { top: '#c08497', bottom: '#6b4453', glow: '#f0c2cf' },
};

/**
 * A plain vertical gradient with a soft off-centre glow.
 *
 * Deliberately abstract: a placeholder must not look like a portrait of
 * somebody, or it reads as a wrong answer rather than a missing one.
 */
function plateSvg(color: FallbackColor): string {
  const { top, bottom, glow } = PALETTE[color];
  const { w, h } = PLATE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    '<defs>',
    '<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0%" stop-color="${top}"/>`,
    `<stop offset="100%" stop-color="${bottom}"/>`,
    '</linearGradient>',
    `<radialGradient id="glow" cx="0.5" cy="0.32" r="0.62">`,
    `<stop offset="0%" stop-color="${glow}" stop-opacity="0.55"/>`,
    `<stop offset="100%" stop-color="${glow}" stop-opacity="0"/>`,
    '</radialGradient>',
    '</defs>',
    `<rect width="${w}" height="${h}" fill="url(#ground)"/>`,
    `<rect width="${w}" height="${h}" fill="url(#glow)"/>`,
    '</svg>',
  ].join('');
}

export function plateFileName(color: FallbackColor): string {
  return `${color}.jpg`;
}

/** Writes every plate into `dir`, overwriting what is there. */
export async function writePlates(dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const color of FALLBACK_COLORS) {
    const file = path.join(dir, plateFileName(color));
    await sharp(Buffer.from(plateSvg(color)), { density: 72 })
      .jpeg(JPEG_OPTIONS)
      .toFile(file);
    written.push(file);
  }
  return written;
}
