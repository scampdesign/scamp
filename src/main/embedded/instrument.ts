import { promises as fs } from 'fs';
import { join } from 'path';

import { ALWAYS_EXCLUDED, excludeFromGit } from './git';

/**
 * How a selected element maps back to its JSX, without installing anything
 * into the project or touching its config: Scamp starts Vite with a config
 * of its own in `.scamp/embedded/`, which loads the project's config and
 * adds one plugin.
 *
 * The plugin writes `data-scamp-src="src/File.tsx:line:col"` into every
 * intrinsic JSX tag (`wrapperConfigSource` says how), which React renders as
 * an attribute on the element. `.scamp/` is in `.git/info/exclude`, so none
 * of it is ever committed.
 * see docs/plans/embedded-scamp-plan.md
 */

export const INSTRUMENT_DIR = join('.scamp', 'embedded');
export const WRAPPER_CONFIG = join(INSTRUMENT_DIR, 'vite.config.scamp.mjs');
export const SOURCE_ATTR = 'data-scamp-src';

/**
 * The generated config. Plain ESM, resolved from the project's own `vite`.
 * Written with `String.raw` so its backslashes are the file's own.
 *
 * Two layers, so every element maps to the line the user wrote:
 * - a `pre` transform, first of all plugins, that writes the attribute
 *   into each intrinsic JSX tag of the ORIGINAL source (parsed with the
 *   project's `@babel/parser`, which `@vitejs/plugin-react` brings), adding
 *   no newlines so every line keeps its number;
 * - the dev runtime wrapper, for a project without `@babel/parser` (SWC),
 *   where `source` is computed on the original file. Under
 *   `@vitejs/plugin-react` it would count lines of the transformed file,
 *   after the fast-refresh preamble, which is why the transform comes first.
 */
export const wrapperConfigSource = (): string => String.raw`// Written by Scamp (Embedded Scamp). Safe to delete; Scamp writes it again.
// It runs this project's own Vite config with one plugin added, which tags
// each element with the file and line of its JSX. Nothing here is committed.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile, mergeConfig } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootPosix = root.split(path.sep).join('/');
const ATTR = '${SOURCE_ATTR}';
const VIRTUAL = '\0scamp-jsx-dev-runtime';

let babelParse = null;
try {
  babelParse = createRequire(path.join(root, 'package.json'))('@babel/parser').parse;
} catch {
  babelParse = null;
}

// A file of the project's own: not its installs, nor a monorepo's hoisted ones above it.
const own = (id) => {
  const file = String(id).split('?')[0].split('\\').join('/');
  return file.startsWith(rootPosix + '/') && !file.startsWith(rootPosix + '/node_modules/') ? file : null;
};

export function tagSources(code, file) {
  let ast;
  try {
    ast = babelParse(code, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: /\.tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
    });
  } catch {
    return null;
  }
  const rel = file.slice(rootPosix.length + 1);
  if (rel.includes('"')) return null;
  const inserts = [];
  const visit = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (
      node.type === 'JSXOpeningElement' &&
      node.name && node.name.type === 'JSXIdentifier' && /^[a-z]/.test(node.name.name) &&
      !node.attributes.some((a) => a.type === 'JSXAttribute' && a.name && a.name.name === ATTR)
    ) {
      inserts.push([node.name.end, ' ' + ATTR + '="' + rel + ':' + node.loc.start.line + ':' + (node.loc.start.column + 1) + '"']);
    }
    for (const key in node) {
      if (key !== 'loc' && key !== 'start' && key !== 'end' && key !== 'extra') visit(node[key]);
    }
  };
  visit(ast.program);
  if (inserts.length === 0) return null;
  inserts.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [at, text] of inserts) out = out.slice(0, at) + text + out.slice(at);
  return out;
}

function scampSource() {
  return {
    name: 'scamp-source',
    enforce: 'pre',
    transform(code, id) {
      if (babelParse === null || !/\.[jt]sx?$/.test(String(id).split('?')[0]) || !code.includes('<')) return null;
      const file = own(id);
      if (file === null) return null;
      const out = tagSources(code, file);
      return out === null ? null : { code: out, map: null };
    },
    resolveId(id, importer) {
      if (id !== 'react/jsx-dev-runtime' || importer === undefined || importer === VIRTUAL) return null;
      // The virtual module's own import of the real runtime goes through.
      return own(importer) === null ? null : VIRTUAL;
    },
    load(id) {
      if (id !== VIRTUAL) return null;
      return [
        "import { jsxDEV as realJsxDEV, Fragment as RealFragment } from 'react/jsx-dev-runtime';",
        'const root = ' + JSON.stringify(rootPosix) + ';',
        'export const Fragment = RealFragment;',
        'export function jsxDEV(type, props, key, isStatic, source, self) {',
        "  if (typeof type === 'string' && source && source.fileName && props && props[" + JSON.stringify(ATTR) + '] === undefined) {',
        "    let file = String(source.fileName).split('\\\\').join('/');",
        "    if (file.startsWith(root + '/')) file = file.slice(root.length + 1);",
        '    props = Object.assign({}, props, { ' + JSON.stringify(ATTR) + ": file + ':' + source.lineNumber + ':' + (source.columnNumber || 0) });",
        '  }',
        '  return realJsxDEV(type, props, key, isStatic, source, self);',
        '}',
      ].join('\n');
    },
  };
}

export default async (env) => {
  const loaded = await loadConfigFromFile(env, undefined, root);
  const user = loaded ? loaded.config : {};
  // Ours first, so it reads the source before any of the project's plugins change it.
  return mergeConfig(mergeConfig({ plugins: [scampSource()] }, user), {
    root,
    optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  });
};
`;

/** Write Scamp's config into the project and keep `.scamp/` out of git. */
export const writeInstrumentation = async (folder: string): Promise<void> => {
  await fs.mkdir(join(folder, INSTRUMENT_DIR), { recursive: true });
  await fs.writeFile(join(folder, WRAPPER_CONFIG), wrapperConfigSource());
  await excludeFromGit(folder, ALWAYS_EXCLUDED);
};

/** How Scamp runs the project's Vite, with its config, on `port`. */
export const viteCommand = (folder: string, port: number): { command: string; args: string[]; env: Record<string, string> } => ({
  command: 'node',
  args: [join(folder, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', WRAPPER_CONFIG, '--port', String(port), '--strictPort'],
  env: {},
});
