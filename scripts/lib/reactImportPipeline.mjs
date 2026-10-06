// The React import's pipeline for the eval scripts: start the app, and
// plan its components and repeats the way the app window does when a
// multi-page import finishes. Shared by `react-import-eval.mjs` and
// `react-agent-eval.mjs`, so the two measure the same import.
// see docs/plans/react-import-plan.md

import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { bundleOf } from './pixelHarness.mjs';

const { detectReactProject } = await bundleOf('src/main/reactImport/detect.ts');
const { viewNameForRoute } = await bundleOf('src/shared/reactRoutes.ts');
const { planReactComponents } = await bundleOf('src/renderer/lib/reactComponents.ts');
const { planRepeats } = await bundleOf('src/renderer/lib/reactRepeats.ts');
const { listNamesAt, parseCallSite } = await bundleOf('src/shared/reactSource.ts');
const { generateCode } = await bundleOf('src/renderer/lib/generateCode.ts');

// ---- the dev server ----------------------------------------------------

const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

const waitForServer = async (url, logs, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the dev server exited (${child.exitCode}):\n${logs.slice(-15).join('')}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`the dev server didn't answer within two minutes:\n${logs.slice(-15).join('')}`);
};

/** Start the project's dev server; resolves with its base URL and a stop function. */
export const startDevServer = async (dir) => {
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'));
  const top = await readdir(dir);
  const nested = [];
  for (const sub of ['src/app', 'src/pages']) {
    if (await stat(join(dir, sub)).then(() => true, () => false)) nested.push(sub);
  }
  const detected = detectReactProject(pkg, [...top, ...nested]);
  if (!detected.ok) throw new Error(detected.reason);
  const project = detected.project;
  if (project.needsInstall) {
    throw new Error(`dependencies aren't installed. Run \`${project.packageManager} install\` in ${dir} first.`);
  }
  const port = await freePort();
  const { command, args, env } = project.devCommand(port);
  console.log(`${project.name}: ${project.framework}, router ${project.router}`);
  console.log(`starting: ${command} ${args.join(' ')}  (port ${port})`);
  const logs = [];
  // Its own process group, so stopping it stops whatever it spawned.
  const child = spawn(command, args, { cwd: dir, env: { ...process.env, ...env }, detached: true });
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  const base = `http://localhost:${port}`;
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  };
  process.on('exit', stop);
  try {
    await waitForServer(base, logs, child);
  } catch (err) {
    stop();
    throw err;
  }
  return { base, stop, project };
};


/**
 * Components and repeats across measured routes — `captured` is
 * `[{ route, measured }]`, `measured` what `measurePage` returned. List
 * names are read from `sourceDir` when it's given.
 */
export const planProject = async (captured, sourceDir) => {
  const flatten = (node, out = new Map()) => {
    out.set(node.id, node);
    node.children.forEach((c) => flatten(c, out));
    return out;
  };
  const views = captured.map(({ route, measured }) => {
    const nodes = flatten(measured.payload.root);
    const react = {};
    for (const [elementId, nodeId] of Object.entries(measured.reduced.sourceNodes)) {
      const info = nodes.get(nodeId)?.react;
      if (info !== undefined) react[elementId] = info;
    }
    return {
      name: viewNameForRoute(route),
      elements: measured.reduced.elements,
      rootId: measured.reduced.rootId,
      react,
      instances: measured.payload.react?.instances ?? {},
    };
  });
  const plan = planReactComponents(views);

  // ---- lists, as repeats (Phase 4) -------------------------------------
  const files = new Map();
  const sources = {};
  const allSites = new Set(
    [...plan.views.map((v) => v.react), ...plan.components.map((c) => c.react)].flatMap((r) =>
      Object.values(r).flatMap((info) => (info.site === undefined ? [] : [info.site]))
    )
  );
  if (sourceDir !== undefined) {
    for (const site of allSites) {
      const call = parseCallSite(site);
      if (call === null) continue;
      if (!files.has(call.path)) {
        files.set(call.path, await readFile(join(sourceDir, call.path), 'utf-8').then((t) => t.split('\n'), () => null));
      }
      const lines = files.get(call.path);
      const names = lines === null ? null : listNamesAt(lines, call);
      if (names !== null) sources[site] = names;
    }
  }
  const repeated = { repeats: 0, rows: 0, skipped: 0, examples: [], why: {} };
  const withRepeats = (tree, takenNames = []) => {
    const result = planRepeats(tree, { sources, takenNames });
    repeated.repeats += result.repeats.length;
    repeated.rows += result.repeats.reduce((n, r) => n + r.rows, 0);
    repeated.skipped += result.skipped.length;
    for (const k of result.skipped) { const field = k.differs.split(' on ')[0]; repeated.why[field] = (repeated.why[field] ?? 0) + 1; }
    for (const r of result.repeats) if (repeated.examples.length < 12) repeated.examples.push(`${r.over}(${r.rows}: ${r.fields.join(', ')})`);
    return result.elements;
  };
  for (const view of plan.views) view.elements = withRepeats(view);
  for (const component of plan.components) component.elements = withRepeats(component, component.props);
  const components = plan.components.map((c) => {
    const code = generateCode({ elements: c.elements, rootId: c.rootId, pageName: c.name, cssModuleImportName: c.name, isComponent: true });
    // The export's shape: a component as the files the app would write.
    return { name: c.name, tsx: code.tsx, css: code.css, tsxContent: code.tsx, cssContent: code.css };
  });

  return { plan, sources, repeated, components };
};
