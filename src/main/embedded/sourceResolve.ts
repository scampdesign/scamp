import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { EmbeddedRawSource } from '@shared/types';

import { inlineMap, originalPosition, projectPath, refineLine, sourceMappingUrl, type SourceMap } from './sourceMap';

/**
 * Turn React's debug location for an element (Next.js: a frame in a dev
 * server chunk, or a server file) into `src/File.tsx:line:col`, through the
 * chunk's source map, then a pass over the file for the exact JSX line.
 * Reads only the app's own origin and files inside the project.
 * see docs/plans/embedded-scamp-plan.md
 */

export type ResolveHints = { tag: string; classes: string[]; text: string };

const MAX_BYTES = 30 * 1024 * 1024;
// Kept briefly: selecting through a list reads one chunk many times, and a hot reload can change it.
const CACHE_MS = 5000;
const cache = new Map<string, { at: number; map: Promise<SourceMap | null> }>();

const inside = (folder: string, file: string): boolean => {
  const rel = path.relative(folder, file);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
};

const fetchText = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > MAX_BYTES ? null : text;
  } catch {
    return null;
  }
};

const readText = async (file: string): Promise<string | null> => {
  try {
    const stat = await fs.stat(file);
    return stat.size > MAX_BYTES ? null : await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
};

const parseMap = (text: string | null): SourceMap | null => {
  if (text === null) return null;
  try {
    return JSON.parse(text) as SourceMap;
  } catch {
    return null;
  }
};

/** The map for a chunk served by the app. */
const mapForUrl = (url: string): Promise<SourceMap | null> => {
  const hit = cache.get(url);
  if (hit !== undefined && Date.now() - hit.at < CACHE_MS) return hit.map;
  const load = (async (): Promise<SourceMap | null> => {
    const code = await fetchText(url);
    const ref = code === null ? null : sourceMappingUrl(code);
    if (ref !== null) return inlineMap(ref) ?? parseMap(await fetchText(new URL(ref, url).href));
    return parseMap(await fetchText(`${url}.map`));
  })();
  cache.set(url, { at: Date.now(), map: load });
  return load;
};

/** The map for a server chunk on disk. */
const mapForFile = async (file: string): Promise<SourceMap | null> => {
  const code = await readText(file);
  const ref = code === null ? null : sourceMappingUrl(code);
  if (ref !== null) return inlineMap(ref) ?? parseMap(await readText(path.resolve(path.dirname(file), ref)));
  return parseMap(await readText(`${file}.map`));
};

/** The project file and line React's location names, before refinement. */
const locate = async (folder: string, origin: string, raw: EmbeddedRawSource): Promise<{ file: string; line: number } | null> => {
  if (raw.kind === 'file') {
    const rel = projectPath(raw.path, folder);
    return rel === null ? null : { file: rel, line: raw.line };
  }
  const url = raw.url.replace(/^rsc:\/\/React\/Server\//, '');
  // webpack's eval'd modules name the file; the line is of the compiled module, so refine it.
  const internal = /^webpack-internal:\/\/\/(?:\([^)]*\)\/)?\.\/(.+)$/.exec(url);
  if (internal !== null) return { file: (internal[1] ?? '').replace(/\?.*$/, ''), line: raw.line };
  let map: SourceMap | null = null;
  if (url.startsWith('file://')) {
    const file = fileURLToPath(url.replace(/\?.*$/, ''));
    if (!inside(folder, file)) return null;
    map = await mapForFile(file);
  } else if (/^https?:\/\//.test(url)) {
    if (new URL(url).origin !== origin) return null;
    map = await mapForUrl(url.replace(/\?.*$/, ''));
  }
  const pos = map === null ? null : originalPosition(map, raw.line, raw.column);
  const rel = pos === null ? null : projectPath(pos.source, folder);
  return pos === null || rel === null ? null : { file: rel, line: pos.line };
};

/** `src/app/page.tsx:12:5` for a raw location, or null when it can't be found in the project. */
export const resolveSource = async (folder: string, origin: string, raw: EmbeddedRawSource, hints: ResolveHints): Promise<string | null> => {
  const found = await locate(folder, origin, raw);
  if (found === null) return null;
  const abs = path.join(folder, found.file);
  if (!inside(folder, abs)) return null;
  // A library's own file can't be edited: report it as it is, and the window says so.
  if (found.file.includes('node_modules/')) return `${found.file}:${found.line}:1`;
  const code = await readText(abs);
  if (code === null) return null;
  const exact = refineLine(code, found.line, hints);
  return exact === null ? `${found.file}:${found.line}:1` : `${found.file}:${exact.line}:${exact.column + 1}`;
};
