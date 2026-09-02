/** Shared scaffolding for tests that run the pipeline against a temp checkout. */

import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { repoRoot } from '../src/paths.js';

/**
 * Creates an empty checkout: the real fallback plates, no curated saints.
 * Tests never write to the working tree.
 */
export async function makeCheckout(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sotd-'));
  await mkdir(path.join(root, 'saints'), { recursive: true });
  await mkdir(path.join(root, 'originals'), { recursive: true });
  await cp(path.join(repoRoot(), 'fallbacks'), path.join(root, 'fallbacks'), { recursive: true });
  return root;
}

/** Writes a curated saint plus a synthetic original big enough to crop. */
export async function addCuratedSaint(
  root: string,
  id: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const width = 1600;
  const height = 3500;
  await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 70, b: 120 } },
  })
    .jpeg({ quality: 90 })
    .toFile(path.join(root, 'originals', `${id}.jpg`));

  const entry: Record<string, unknown> = {
    name: 'St. Test of Somewhere',
    years: '1815–1888',
    blurb: 'A curated blurb.',
    credit: 'Photograph, c. 1880',
    license: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    crop: { x: 100, y: 200, width: 1400, height: 3033 },
    ...overrides,
  };

  const lines: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (value === undefined) continue;
    if (key === 'crop' && typeof value === 'object' && value !== null) {
      lines.push('crop:');
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  await writeFile(path.join(root, 'saints', `${id}.yaml`), `${lines.join('\n')}\n`, 'utf8');
}

export interface TreeSnapshot {
  /** Relative path -> sha256 of the file's bytes. */
  readonly files: ReadonlyMap<string, string>;
}

/** Hashes every file under `dir`, so two runs can be compared byte for byte. */
export async function snapshotTree(dir: string): Promise<TreeSnapshot> {
  const { createHash } = await import('node:crypto');
  const files = new Map<string, string>();

  async function walk(current: string): Promise<void> {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const bytes = await readFile(full);
        files.set(path.relative(dir, full), createHash('sha256').update(bytes).digest('hex'));
      }
    }
  }

  await walk(dir);
  return { files };
}

export function snapshotEquals(a: TreeSnapshot, b: TreeSnapshot): boolean {
  if (a.files.size !== b.files.size) return false;
  for (const [file, hash] of a.files) {
    if (b.files.get(file) !== hash) return false;
  }
  return true;
}

/** Files present in `b` but not `a`, or whose bytes changed. */
export function snapshotDiff(a: TreeSnapshot, b: TreeSnapshot): string[] {
  const changed: string[] = [];
  for (const [file, hash] of b.files) {
    if (a.files.get(file) !== hash) changed.push(file);
  }
  for (const file of a.files.keys()) {
    if (!b.files.has(file)) changed.push(`removed: ${file}`);
  }
  return changed.sort();
}
