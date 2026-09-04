/** The sources the curation tool can search. */

import { commonsSource } from './commons.js';
import { metSource } from './met.js';
import type { ImageSource } from './types.js';

/** Commons first: it is the default and the only one that publishes sizes. */
export const SOURCES: readonly ImageSource[] = [commonsSource, metSource];

export const DEFAULT_SOURCE_ID = commonsSource.id;

export function sourceById(id: string | null | undefined): ImageSource {
  return SOURCES.find((source) => source.id === id) ?? commonsSource;
}

export * from './types.js';
export { commonsSource, metSource };
