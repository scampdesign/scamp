import { promises as fs } from 'fs';
import { join, relative, sep } from 'path';
import type { DevVarsReadResult, RouteFile, RouteRender } from '@shared/types';
import { viewSlugFor } from '@shared/templates';

/**
 * Reading and small edits to `routes/` in a Scamp-framework project.
 * The framework owns routing (scampjs CONTRACT.md section 1.5); the app
 * lists the files, reads a `render` export, writes one, and generates
 * a route for a view. Pure helpers first, so the parsing is unit-tested.
 * see docs/notes/routes-in-the-app.md
 */

const ROUTE_EXTENSION = /\.(tsx|jsx|ts|js)$/;

/** Mirrors the framework's segment grammar: `index`, `[param]`, `[...rest]`, `(group)`. */
const segmentsToPath = (parts: string[]): string => {
  const out: string[] = [];
  for (const [i, part] of parts.entries()) {
    if (part.startsWith('(') && part.endsWith(')')) continue;
    if (i === parts.length - 1 && part === 'index') continue;
    const rest = /^\[\.\.\.([^\]]+)\]$/.exec(part);
    if (rest?.[1] !== undefined) {
      out.push(`:${rest[1]}*`);
      continue;
    }
    const param = /^\[([^\]]+)\]$/.exec(part);
    if (param?.[1] !== undefined) {
      out.push(`:${param[1]}`);
      continue;
    }
    out.push(part);
  }
  return `/${out.join('/')}`;
};

/** The URL pattern a route file answers, or null for a file that is not a route. */
export const routePathFor = (file: string): string | null => {
  if (!ROUTE_EXTENSION.test(file)) return null;
  return segmentsToPath(file.replace(ROUTE_EXTENSION, '').split('/'));
};

export const isApiRouteFile = (file: string): boolean =>
  file === 'api' || file.startsWith('api/');

const RENDER_RE = /^export\s+const\s+render\s*=\s*['"](static|server|client)['"]\s*;?[ \t]*$/m;

/** The `render` export, or null when the file declares none. */
export const parseRenderExport = (tsx: string): RouteRender | null => {
  const match = RENDER_RE.exec(tsx);
  const mode = match?.[1];
  return mode === 'static' || mode === 'server' || mode === 'client' ? mode : null;
};

/** The view a route imports from `views/<Name>/<Name>`, or null. */
export const parseViewImport = (tsx: string): string | null => {
  const match = /^import\s+(\w+)\s+from\s+['"]@\/views\/(\w+)\/\2['"]\s*;?\s*$/m.exec(tsx);
  return match?.[2] ?? null;
};

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Point a route at a renamed view: its import, the tag it renders, and
 * the route function's own name when it was named after the view.
 *
 * A rewrite rather than a regeneration. By the time a view is renamed
 * the route may hold a real `load()`, a query, or anything else its
 * author put there, and none of that is the app's to rewrite.
 */
export const renameRouteView = (
  tsx: string,
  oldName: string,
  newName: string
): string => {
  const old = escapeRe(oldName);
  return tsx
    .replace(
      new RegExp(`^import\\s+${old}\\s+from\\s+(['"])@/views/${old}/${old}\\1\\s*;?\\s*$`, 'm'),
      `import ${newName} from '@/views/${newName}/${newName}';`
    )
    .replace(new RegExp(`<${old}(?=[\\s/>])`, 'g'), `<${newName}`)
    .replace(new RegExp(`</${old}>`, 'g'), `</${newName}>`)
    .replace(
      new RegExp(`(export\\s+default\\s+function\\s+)${old}Route\\b`),
      `$1${newName}Route`
    );
};

/** `home` is the root route; every other slug is its own file. */
export const routeFileForSlug = (slug: string): string =>
  slug === 'home' ? 'index.tsx' : `${slug}.tsx`;

/**
 * Follow a view rename into the route that renders it: rewrite the
 * references, and move the file when its name was the one the app
 * would have given it. A route the developer put somewhere else —
 * nested, or named for the URL rather than the view — keeps its place;
 * only its references change, because the URL is their decision and
 * the broken import is not.
 *
 * Returns the route's file after the rename, or null when no route
 * renders that view.
 */
export const renameRouteForView = async (
  projectPath: string,
  oldView: string,
  newView: string
): Promise<string | null> => {
  const routes = await listRoutes(projectPath);
  const route = routes.find((r) => r.kind === 'page' && r.view === oldView);
  if (!route) return null;

  const source = await readRouteFile(projectPath, route.file);
  const rewritten = renameRouteView(source, oldView, newView);

  const generatedName = routeFileForSlug(viewSlugFor(oldView));
  if (route.file !== generatedName) {
    await fs.writeFile(routeFilePath(projectPath, route.file), rewritten, 'utf-8');
    return route.file;
  }
  const target = routeFileForSlug(viewSlugFor(newView));
  const targetPath = routeFilePath(projectPath, target);
  if (target !== route.file) {
    const taken = await fs
      .access(targetPath)
      .then(() => true)
      .catch(() => false);
    if (taken) {
      throw new Error(
        `routes/${target} already exists, so routes/${route.file} was left as it is.`
      );
    }
  }
  await fs.writeFile(targetPath, rewritten, 'utf-8');
  if (target !== route.file) await fs.rm(routeFilePath(projectPath, route.file));
  return target;
};

/**
 * Write a `render` export: replace the existing one, or add it after the
 * imports. `static` is the framework's default, but writing it keeps the
 * user's choice visible in the file.
 */
export const setRenderExport = (tsx: string, mode: RouteRender): string => {
  const line = `export const render = '${mode}';`;
  if (RENDER_RE.test(tsx)) return tsx.replace(RENDER_RE, line);
  const lines = tsx.split('\n');
  let last = -1;
  for (const [i, l] of lines.entries()) if (/^import\s/.test(l)) last = i;
  if (last === -1) return `${line}\n\n${tsx}`;
  // Skip a multi-line import that ends later.
  let end = last;
  while (end < lines.length - 1 && !/;\s*$/.test(lines[end] ?? '') && !/^\s*$/.test(lines[end + 1] ?? '')) end += 1;
  lines.splice(end + 1, 0, '', line);
  return lines.join('\n');
};

const walk = async (dir: string, base: string): Promise<string[]> => {
  const out: string[] = [];
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
};

/** Every route file, page routes first, each in path order. */
export const listRoutes = async (projectPath: string): Promise<RouteFile[]> => {
  const routesDir = join(projectPath, 'routes');
  const files = await walk(routesDir, routesDir);
  const routes: RouteFile[] = [];
  for (const file of files) {
    const path = routePathFor(file);
    if (path === null) continue;
    if (isApiRouteFile(file)) {
      routes.push({ file, kind: 'api', path });
      continue;
    }
    const tsx = await fs.readFile(join(routesDir, file), 'utf-8');
    const view = parseViewImport(tsx);
    routes.push({
      file,
      kind: 'page',
      path,
      render: parseRenderExport(tsx) ?? 'static',
      ...(view !== null ? { view } : {}),
    });
  }
  const rank = (r: RouteFile): number => (r.kind === 'page' ? 0 : 1);
  return routes.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
};

/** A route file's path inside the project, refusing anything outside `routes/`. */
const routeFilePath = (projectPath: string, file: string): string => {
  // Backslash and `:` too: on Windows `..\..\x.js` or `C:x.js` would escape.
  if (!ROUTE_EXTENSION.test(file) || file.includes('\\') || file.split('/').some((p) => p === '..' || p === '' || p === '.' || p.includes(':'))) {
    throw new Error(`"${file}" is not a route file.`);
  }
  return join(projectPath, 'routes', ...file.split('/'));
};

export const readRouteFile = (projectPath: string, file: string): Promise<string> =>
  fs.readFile(routeFilePath(projectPath, file), 'utf-8');

export const setRouteRender = async (
  projectPath: string,
  file: string,
  render: RouteRender
): Promise<void> => {
  const path = routeFilePath(projectPath, file);
  const tsx = await fs.readFile(path, 'utf-8');
  const next = setRenderExport(tsx, render);
  if (next !== tsx) await fs.writeFile(path, next, 'utf-8');
};

/** Write a new route file; an existing one is the user's and is never replaced. */
export const writeRouteFile = async (
  projectPath: string,
  file: string,
  content: string
): Promise<void> => {
  const path = routeFilePath(projectPath, file);
  try {
    await fs.access(path);
    throw new Error(`routes/${file} already exists.`);
  } catch (err) {
    if (err instanceof Error && err.message.endsWith('already exists.')) throw err;
  }
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, content, 'utf-8');
};

/** The keys in `.dev.vars`. Values stay on disk: the renderer never sees a secret. */
export const readDevVarsKeys = async (projectPath: string): Promise<DevVarsReadResult> => {
  let text: string;
  try {
    text = await fs.readFile(join(projectPath, '.dev.vars'), 'utf-8');
  } catch {
    return { exists: false, keys: [] };
  }
  const keys = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#') && l.includes('='))
    .map((l) => l.slice(0, l.indexOf('=')).trim().replace(/^export\s+/, ''))
    .filter((k) => k !== '');
  return { exists: true, keys: [...new Set(keys)] };
};
