/**
 * The local curation server.
 *
 * A tool for one person at a keyboard: it binds to loopback, holds no state,
 * and writes only `saints/` and `originals/`. It never touches `docs/`, which
 * is derived and belongs to the publish job.
 *
 * Built on `node:http` and `fetch` with no framework, so the tool adds no
 * dependency to a repository whose whole discipline is a small, auditable
 * surface.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpFetcher, type Fetcher } from './commons.js';
import {
  candidateFit,
  DEFAULT_SOURCE_ID,
  sizeKnown,
  SOURCES,
  sourceById,
} from './sources/index.js';
import { imageSize } from '../render/images.js';
import { buildQueue, defaultQuery, type QueueOptions } from './queue.js';
import {
  httpDownloader,
  renderPreview,
  saveCuratedSaint,
  SaveError,
  type Downloader,
} from './save.js';
import { CurationError } from '../curation/schema.js';
import { MAX_UPSCALE, VARIANTS } from '../config.js';
import { minimumSource } from '../crop.js';

/** The largest variant: the crop must be at least this, and shares its ratio. */
const LARGEST = VARIANTS[0];

export interface ServerOptions extends QueueOptions {
  readonly port?: number;
  readonly fetcher?: Fetcher;
  readonly downloader?: Downloader;
}

/** The UI is authored as a real .html file so it stays editable and lintable. */
async function readUi(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Resolves from dist/curate/ back to the source tree; this tool only ever
  // runs from a checkout.
  return readFile(path.resolve(here, '../../src/curate/ui.html'), 'utf8');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    total += (chunk as Buffer).length;
    // A save request is a few hundred bytes; anything larger is a mistake.
    if (total > 64 * 1024) throw new SaveError('Request body too large');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function asString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new SaveError(`\`${key}\` is required`);
  return value;
}

function asCrop(source: Record<string, unknown>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const crop = source['crop'];
  if (typeof crop !== 'object' || crop === null) throw new SaveError('`crop` is required');
  const box = crop as Record<string, unknown>;
  const read = (key: string): number => {
    const value = box[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new SaveError(`\`crop.${key}\` must be a number`);
    }
    return Math.round(value);
  };
  return { x: read('x'), y: read('y'), width: read('width'), height: read('height') };
}

export function createCurationServer(options: ServerOptions = {}) {
  const fetcher = options.fetcher ?? httpFetcher;
  const downloader = options.downloader ?? httpDownloader;

  return createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) {
        const status = error instanceof SaveError || error instanceof CurationError ? 400 : 500;
        sendJson(response, status, { error: message });
      } else {
        response.end();
      }
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/') {
      const html = await readUi();
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(html);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/queue') {
      const queue = await buildQueue(options);
      sendJson(response, 200, {
        today: queue.today,
        curatedCount: queue.curatedCount,
        // The crop constraint travels with the queue so the page never
        // restates the frozen sizes. Changing VARIANTS changes the UI too.
        render: { width: LARGEST.w, height: LARGEST.h },
        maxUpscale: MAX_UPSCALE,
        sources: SOURCES.map((s) => ({ id: s.id, label: s.label, note: s.note ?? '' })),
        items: queue.items.map((item) => ({ ...item, query: defaultQuery(item.name) })),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/search') {
      const term = url.searchParams.get('q')?.trim() ?? '';
      if (term === '') {
        sendJson(response, 400, { error: 'q is required' });
        return;
      }
      const offset = Number(url.searchParams.get('offset') ?? '0');
      // The size minimum is pushed into the query so paging returns usable
      // results; `largeEnough` is still recomputed from what comes back.
      // The threshold is what the renderer can actually use: a source small
      // enough to need more than MAX_UPSCALE is no use at any setting.
      const bigOnly = url.searchParams.get('big') === '1';
      const floor = minimumSource();
      const source = sourceById(url.searchParams.get('source'));
      const result = await source.search(fetcher, term, {
        offset: Number.isFinite(offset) ? offset : 0,
        ...(bigOnly ? { minWidth: floor.width, minHeight: floor.height } : {}),
        excludeStructures: url.searchParams.get('nostructures') === '1',
      });
      sendJson(response, 200, {
        rejectedForLicense: result.rejectedForLicense,
        nextOffset: result.nextOffset,
        // The fit is computed here so the page never restates the geometry.
        files: result.candidates.map((c) => ({ ...c, ...candidateFit(c) })),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/file') {
      const title = url.searchParams.get('title')?.trim() ?? '';
      const width = Number(url.searchParams.get('width') ?? '1000');
      const source = sourceById(url.searchParams.get('source'));
      const file = await source.byRef(fetcher, title, Number.isFinite(width) ? width : 1000);
      if (!file) {
        sendJson(response, 404, { error: `${source.label} has no file ${JSON.stringify(title)}` });
        return;
      }
      // A source that publishes no dimensions gets measured here, before the
      // crop box is drawn — the page cannot frame anything against 0x0.
      const measured = sizeKnown(file)
        ? file
        : { ...file, ...(await imageSize(await downloader(file.url))) };
      sendJson(response, 200, { ...measured, ...candidateFit(measured) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/preview') {
      const body = (await readBody(request)) as Record<string, unknown>;
      const previewSource = sourceById(
        typeof body['sourceId'] === 'string' ? body['sourceId'] : DEFAULT_SOURCE_ID,
      );
      const file = await previewSource.byRef(fetcher, asString(body, 'fileTitle'));
      if (!file) {
        sendJson(response, 404, { error: 'No such file' });
        return;
      }
      const jpeg = await renderPreview(file, asCrop(body), downloader);
      response.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.length),
        'Cache-Control': 'no-store',
      });
      response.end(jpeg);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/save') {
      const body = (await readBody(request)) as Record<string, unknown>;
      const result = await saveCuratedSaint(
        {
          id: asString(body, 'id'),
          name: asString(body, 'name'),
          years: typeof body['years'] === 'string' ? body['years'] : '',
          blurb: asString(body, 'blurb'),
          notification: typeof body['notification'] === 'string' ? body['notification'] : '',
          sourceId: typeof body['sourceId'] === 'string' ? body['sourceId'] : DEFAULT_SOURCE_ID,
          fileTitle: asString(body, 'fileTitle'),
          crop: asCrop(body),
          allowUpscale: body['allowUpscale'] === true,
        },
        { fetcher, downloader, ...(options.root === undefined ? {} : { root: options.root }) },
      );
      sendJson(response, 200, {
        id: result.id,
        yamlPath: path.basename(result.yamlPath),
        originalPath: path.basename(result.originalPath),
        staleRenders: result.staleRenders,
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  }
}
