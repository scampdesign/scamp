import { promises as fs } from 'fs';
import { join } from 'path';
import type {
  ComponentCreateArgs,
  ComponentDeleteArgs,
  ComponentFile,
  ComponentKind,
  ComponentReadArgs,
  ComponentReadThumbnailArgs,
  ComponentReadThumbnailResult,
  ComponentWriteThumbnailArgs,
  ComponentWriteThumbnailResult,
  ProjectFormat,
} from '@shared/types';
import { parseViewWrapper, viewSlugFor, viewWrapperTsx } from '@shared/templates';

import {
  COMPONENT_NAME_RE,
  DEFAULT_COMPONENT_CSS,
  defaultComponentTsx,
} from './componentScaffold';
import { PAGE_NAME_RE } from './pageOps';


/**
 * Path layout for one component. Mirrors `pagePathsFor` in
 * shape — folder + TSX + CSS module, where the folder is the
 * component's canonical identifier.
 */
export const componentPathsFor = (
  projectPath: string,
  componentName: string,
  kind: ComponentKind = 'component'
): { tsxPath: string; cssPath: string; componentDir: string } => {
  const componentDir = join(
    projectPath,
    kind === 'view' ? 'views' : 'components',
    componentName
  );
  return {
    tsxPath: join(componentDir, `${componentName}.tsx`),
    cssPath: join(componentDir, `${componentName}.module.css`),
    componentDir,
  };
};

/** Remove Scamp's own files, then the folder only if nothing else is in it — agents add tests and stories there. */
const removeFilesAndEmptyDir = async (files: ReadonlyArray<string>, dir: string): Promise<void> => {
  for (const file of files) await fs.rm(file, { force: true });
  try {
    if ((await fs.readdir(dir)).length === 0) await fs.rmdir(dir);
  } catch {
    // Folder already gone.
  }
};

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Default starter content for a brand-new blank component. The
 * shape mirrors what `generateCode` emits for an empty root so
 * a parse → regen round-trip is text-stable: the renderer's
 * canonical-migration write doesn't fire after `loadComponent`,
 * which kept the `lastSerialized` cache in sync with the
 * chokidar `add` event for the freshly-written file. Without
 * that, the next chokidar event's echo guard missed and the
 * handler reloaded the empty tree on top of any rect the user
 * had just drawn. see docs/notes/component-scaffold-roundtrip.md
 */

/**
 * Refuses to operate on a non-Nextjs project — components don't
 * exist in the legacy layout, and silently no-op'ing would
 * leave the renderer with a dangling state. The renderer's
 * components sidebar handles the surfacing.
 */
const assertNextjs = (format: ProjectFormat): void => {
  if (format === 'legacy') {
    throw new Error('Components are only supported in Next.js- or Scamp-format projects.');
  }
};

/** `app/<slug>/page.tsx` and its CSS module; `home` is the root page. */
export const wrapperPagePathsFor = (
  projectPath: string,
  slug: string
): { tsxPath: string; cssPath: string; pageDir: string | null } => {
  const pageDir = slug === 'home' ? null : join(projectPath, 'app', slug);
  const base = pageDir ?? join(projectPath, 'app');
  return {
    tsxPath: join(base, 'page.tsx'),
    cssPath: join(base, 'page.module.css'),
    pageDir,
  };
};

/**
 * The route file that renders a view, for a Scamp-framework project.
 *
 * Byte-identical to `generateRoute.ts`'s output for a view with no
 * props, which an imported one never has — that module builds a
 * `load()` from a view's sample data and lives in the renderer, where
 * it backs the Routes section's "Generate route". Kept here rather
 * than reached for across the process boundary; change both together.
 */
const viewRouteTsx = (viewName: string): string =>
  `import ${viewName} from '@/views/${viewName}/${viewName}';\n\nexport const render = 'static';\n\nexport default function ${viewName}Route() {\n  return <${viewName} />;\n}\n`;

/**
 * Give a new view a URL.
 *
 * The two formats serve pages from different places, and this wrote
 * only one of them: `app/<slug>/page.tsx`, which is Next.js's. A
 * Scamp-framework project routes from `routes/`, so an imported or
 * newly created view had no URL at all there — the preview loaded the
 * home page, and every link or page-picker jump after it was a 404 and
 * a blank white screen.
 */
const writeViewUrl = async (
  projectPath: string,
  viewName: string,
  slug: string,
  replacePage: boolean,
  format: ProjectFormat
): Promise<void> => {
  if (format === 'scamp') {
    const file = join(projectPath, 'routes', slug === 'home' ? 'index.tsx' : `${slug}.tsx`);
    if ((await pathExists(file)) && !replacePage) return;
    await fs.mkdir(join(projectPath, 'routes'), { recursive: true });
    await fs.writeFile(file, viewRouteTsx(viewName), 'utf-8');
    return;
  }
  await writeViewWrapper(projectPath, viewName, slug, replacePage);
};

/**
 * Write the one-line wrapper page that renders a view. A page already
 * at the slug is left alone unless `replacePage` — the convert path —
 * in which case its TSX becomes the wrapper and its CSS module goes,
 * so the scan stops listing it as a page.
 */
const writeViewWrapper = async (
  projectPath: string,
  viewName: string,
  slug: string,
  replacePage: boolean
): Promise<void> => {
  const { tsxPath, cssPath, pageDir } = wrapperPagePathsFor(projectPath, slug);
  if ((await pathExists(tsxPath)) && !replacePage) return;
  if (pageDir) await fs.mkdir(pageDir, { recursive: true });
  await fs.writeFile(tsxPath, viewWrapperTsx(viewName), 'utf-8');
  if (replacePage) await fs.rm(cssPath, { force: true });
};

/** Remove a view's wrapper page if `app/<slug>/page.tsx` is one for it. */
const removeViewWrapper = async (
  projectPath: string,
  viewName: string,
  slug: string
): Promise<void> => {
  const { tsxPath, cssPath, pageDir } = wrapperPagePathsFor(projectPath, slug);
  let tsx: string;
  try {
    tsx = await fs.readFile(tsxPath, 'utf-8');
  } catch {
    return;
  }
  if (parseViewWrapper(tsx) !== viewName) return;
  // The root page must exist for Next to serve `/`; a home wrapper is
  // left in place and the renderer says so.
  if (pageDir === null) return;
  await removeFilesAndEmptyDir([tsxPath, cssPath], pageDir);
};

export const createComponent = async (
  args: ComponentCreateArgs,
  format: ProjectFormat
): Promise<ComponentFile> => {
  assertNextjs(format);
  const kind: ComponentKind = args.kind ?? 'component';
  if (!COMPONENT_NAME_RE.test(args.componentName)) {
    throw new Error(
      `Invalid ${kind} name "${args.componentName}". Use PascalCase letters and digits only (e.g. \`Button\`, \`HeroCard\`).`
    );
  }
  // The slug becomes a folder under app/ or routes/; anything else could point outside the project.
  if (typeof args.wrapperSlug === 'string' && !PAGE_NAME_RE.test(args.wrapperSlug)) {
    throw new Error(`Invalid page name "${args.wrapperSlug}".`);
  }
  const { tsxPath, cssPath, componentDir } = componentPathsFor(
    args.projectPath,
    args.componentName,
    kind
  );
  // One namespace for both kinds: the store, thumbnails, and the props
  // type are all keyed by name, so a view and a component can't share one.
  const otherKind: ComponentKind = kind === 'view' ? 'component' : 'view';
  const other = componentPathsFor(args.projectPath, args.componentName, otherKind);
  // The files, not the folder: a deleted component's folder can stay behind holding the user's own files.
  if (await pathExists(tsxPath)) {
    throw new Error(`A ${kind} named "${args.componentName}" already exists.`);
  }
  if (await pathExists(other.tsxPath)) {
    throw new Error(
      `A ${otherKind} named "${args.componentName}" already exists; views and components share one set of names.`
    );
  }
  await fs.mkdir(join(args.projectPath, kind === 'view' ? 'views' : 'components'), {
    recursive: true,
  });
  await fs.mkdir(componentDir, { recursive: true });
  const tsxContent = args.tsxContent ?? defaultComponentTsx(args.componentName);
  const cssContent = args.cssContent ?? DEFAULT_COMPONENT_CSS;
  await fs.writeFile(tsxPath, tsxContent, 'utf-8');
  await fs.writeFile(cssPath, cssContent, 'utf-8');
  if (kind === 'view' && typeof args.wrapperSlug === 'string') {
    await writeViewUrl(
      args.projectPath,
      args.componentName,
      args.wrapperSlug,
      args.replacePage === true,
      format
    );
  }
  return {
    name: args.componentName,
    kind,
    tsxPath,
    cssPath,
    tsxContent,
    cssContent,
  };
};

export const deleteComponent = async (
  args: ComponentDeleteArgs,
  format: ProjectFormat
): Promise<void> => {
  assertNextjs(format);
  const kind: ComponentKind = args.kind ?? 'component';
  if (!COMPONENT_NAME_RE.test(args.componentName)) {
    throw new Error(`Invalid ${kind} name "${args.componentName}".`);
  }
  const { tsxPath, cssPath, componentDir } = componentPathsFor(
    args.projectPath,
    args.componentName,
    kind
  );
  await removeFilesAndEmptyDir([tsxPath, cssPath], componentDir);
  if (kind === 'view') {
    // Wrapper only. The route that renders a view in a Scamp-framework
    // project is the user's file, and a rename depends on it surviving
    // until `renameRouteForView` moves it — deleting it here turned
    // every page rename into a page with no route at all.
    await removeViewWrapper(
      args.projectPath,
      args.componentName,
      viewSlugFor(args.componentName)
    );
  }
};

export const readComponent = async (
  args: ComponentReadArgs,
  format: ProjectFormat
): Promise<ComponentFile | null> => {
  assertNextjs(format);
  const kind: ComponentKind = args.kind ?? 'component';
  if (!COMPONENT_NAME_RE.test(args.componentName)) {
    throw new Error(`Invalid ${kind} name "${args.componentName}".`);
  }
  const { tsxPath, cssPath } = componentPathsFor(
    args.projectPath,
    args.componentName,
    kind
  );
  try {
    const [tsxContent, cssContent] = await Promise.all([
      fs.readFile(tsxPath, 'utf-8'),
      fs.readFile(cssPath, 'utf-8'),
    ]);
    return {
      name: args.componentName,
      kind,
      tsxPath,
      cssPath,
      tsxContent,
      cssContent,
    };
  } catch {
    return null;
  }
};

// Sidebar thumbnail storage. see docs/notes/components-thumbnails.md
const thumbnailPathFor = (
  projectPath: string,
  componentName: string
): { dir: string; file: string } => {
  const dir = join(projectPath, '.scamp', 'component-thumbs');
  const file = join(dir, `${componentName}.png`);
  return { dir, file };
};

const decodeDataUrl = (dataUrl: string): Buffer => {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URL');
  const base64 = dataUrl.slice(comma + 1);
  return Buffer.from(base64, 'base64');
};

export const writeComponentThumbnail = async (
  args: ComponentWriteThumbnailArgs,
  format: ProjectFormat
): Promise<ComponentWriteThumbnailResult> => {
  assertNextjs(format);
  if (!COMPONENT_NAME_RE.test(args.componentName)) {
    return {
      ok: false,
      error: `Invalid component name "${args.componentName}".`,
    };
  }
  try {
    const { dir, file } = thumbnailPathFor(
      args.projectPath,
      args.componentName
    );
    await fs.mkdir(dir, { recursive: true });
    const buf = decodeDataUrl(args.dataUrl);
    await fs.writeFile(file, buf);
    return { ok: true, thumbnailPath: file };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Thumbnail write failed.',
    };
  }
};

export const readComponentThumbnail = async (
  args: ComponentReadThumbnailArgs,
  format: ProjectFormat
): Promise<ComponentReadThumbnailResult> => {
  assertNextjs(format);
  if (!COMPONENT_NAME_RE.test(args.componentName)) {
    return { base64: null };
  }
  const { file } = thumbnailPathFor(args.projectPath, args.componentName);
  try {
    const buf = await fs.readFile(file);
    return { base64: buf.toString('base64') };
  } catch {
    return { base64: null };
  }
};
