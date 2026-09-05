/**
 * Static checks on the curator page.
 *
 * `eslint` sees only `.ts`, so the page's inline script — the largest single
 * piece of code in the tool — was unchecked, and shipped a reference to an
 * input that was never declared. The page cannot be typechecked, but it can
 * be linted, and `no-undef` catches exactly that class of mistake.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';

const uiPath = path.join(fileURLToPath(new URL('../src/curate', import.meta.url)), 'ui.html');

/**
 * Everything the page may reach for from the platform. Deliberately spelled
 * out rather than pulled from a globals package: the list is short, it is the
 * page's entire dependency on the browser, and a new entry is a decision worth
 * seeing in a diff.
 */
const BROWSER_GLOBALS = [
  'document',
  'window',
  'fetch',
  'console',
  'setTimeout',
  'clearTimeout',
  'requestAnimationFrame',
  'URL',
  'URLSearchParams',
  'Image',
  'Blob',
  'FormData',
  'AbortController',
  'navigator',
  'location',
  'alert',
  'confirm',
  'getComputedStyle',
  'addEventListener',
  'removeEventListener',
] as const;

async function inlineScript(): Promise<string> {
  const html = await readFile(uiPath, 'utf8');
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  expect(match, 'ui.html should contain exactly one inline module script').not.toBeNull();
  return match![1];
}

describe('the curator page', () => {
  it('references nothing it has not declared', async () => {
    const source = await inlineScript();
    const messages = new Linter().verify(source, {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        globals: Object.fromEntries(BROWSER_GLOBALS.map((name) => [name, 'readonly'])),
      },
      rules: { 'no-undef': 'error' },
    });

    // Report the identifier and line, so a failure names the typo rather than
    // leaving someone to open the page and click until it throws.
    const undefined_ = messages.map((m) => `line ${m.line}: ${m.message}`);
    expect(undefined_).toEqual([]);
  });

  it('parses as a module', async () => {
    const source = await inlineScript();
    const messages = new Linter().verify(source, {
      languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
      rules: {},
    });
    expect(messages.filter((m) => m.fatal)).toEqual([]);
  });
});
