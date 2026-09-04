/** Builds one published day record. */

import {
  DEFAULT_FALLBACK_COLOR,
  FALLBACK_COLORS,
  PLACEHOLDER_IMAGE_META,
  SCHEMA_VERSION,
  type FallbackColor,
} from '../config.js';
import type { LiturgicalDay } from '../calendar/types.js';
import type { CuratedSaint } from '../curation/loader.js';
import { variantsFor } from '../render/images.js';
import type { DayRecord, ImageVariant } from './record.js';
import { resolveNotification } from './notification.js';
import { resolveSubject, type Subject } from './subject.js';

/** The plate id a day falls back to, e.g. `fallback-violet`. */
export function fallbackImageId(color: string): string {
  const plate: FallbackColor = (FALLBACK_COLORS as readonly string[]).includes(color)
    ? (color as FallbackColor)
    : // Black is only ever a secondary colour for All Souls, and any colour a
      // future romcal release adds would land here too rather than 404.
      DEFAULT_FALLBACK_COLOR;
  return `fallback-${plate}`;
}

export interface BuiltDay {
  readonly record: DayRecord;
  readonly subject: Subject;
  /**
   * The image the record points at: either a curated saint or a colour plate.
   * The caller renders it.
   */
  readonly imageId: string;
}

export function buildDay(day: LiturgicalDay, curated: CuratedSaint | undefined): BuiltDay {
  const subject = resolveSubject(day);
  const displayName = curated?.entry.name ?? subject.name;
  const imageId = curated ? subject.id : fallbackImageId(day.color);
  const variants: readonly ImageVariant[] = variantsFor(imageId);

  const record: DayRecord = {
    schema: SCHEMA_VERSION,
    date: day.date,
    season: day.season,
    color: day.color,
    rank: day.rank,
    celebration: day.celebrations[0]?.name ?? '',
    all_celebrations: day.celebrations.map((celebration) => celebration.name),
    notification: resolveNotification(subject, displayName, curated?.entry.notification),
    saint: {
      id: subject.id,
      name: displayName,
      years: curated?.entry.years ?? '',
      blurb: curated?.entry.blurb ?? '',
      is_fallback: subject.isFallback,
      source: subject.source,
    },
    image: curated
      ? {
          credit: curated.entry.credit,
          license: curated.entry.license,
          source: curated.entry.source,
          is_placeholder: false,
          variants,
        }
      : {
          credit: PLACEHOLDER_IMAGE_META.credit,
          license: PLACEHOLDER_IMAGE_META.license,
          source: PLACEHOLDER_IMAGE_META.source,
          is_placeholder: true,
          variants,
        },
  };

  return { record, subject, imageId };
}
