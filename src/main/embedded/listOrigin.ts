import type { EmbeddedListOrigin } from '@shared/types';

import { elementAt, parseFile, splitSource, type JsxNode as Node } from './content';

/**
 * Where a list's order comes from, for a move among items drawn by one
 * `.map()`: an array written in the project (the agent reorders its items)
 * or data (an API, state, props, or a value worked out while the app runs),
 * whose order Scamp can't change. Pure apart from `read`.
 * see docs/notes/embedded-move-preview.md
 */

export type ListQuery = {
  /** The element's JSX, then where its component is used: the `.map()` is around one of them. */
  sources: ReadonlyArray<string>;
  read: (file: string) => Promise<string | null>;
  /** Import aliases from tsconfig `paths`, such as `@/` → `src/`. */
  aliases: ReadonlyArray<{ prefix: string; target: string }>;
};

const ITERATORS = new Set(['map', 'flatMap']);
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

const unwrap = (node: Node | undefined): Node | undefined =>
  node !== undefined && /^TS(As|Satisfies|NonNull)Expression$|^ParenthesizedExpression$/.test(node.type) ? unwrap(node['expression'] as Node) : node;

const lineOf = (file: string, node: Node): string => `${file}:${node.loc?.start.line ?? 0}`;

/** Whether a binding pattern (a parameter, a destructuring) declares `name`. */
const binds = (pattern: Node | null | undefined, name: string): boolean => {
  if (pattern === null || pattern === undefined) return false;
  if (pattern.type === 'Identifier') return pattern['name'] === name;
  if (pattern.type === 'AssignmentPattern') return binds(pattern['left'] as Node, name);
  if (pattern.type === 'RestElement') return binds(pattern['argument'] as Node, name);
  if (pattern.type === 'ArrayPattern') return (pattern['elements'] as Array<Node | null>).some((e) => binds(e, name));
  if (pattern.type === 'ObjectPattern') return (pattern['properties'] as Node[]).some((p) => binds((p['value'] ?? p['argument']) as Node | undefined, name));
  return false;
};

/** How `name` is declared in `body` (statements): as an array literal (`array`, its declarator), or from something else (`other`, the value). */
const declared = (body: ReadonlyArray<Node>, name: string): { kind: 'array'; decl: Node } | { kind: 'other'; init: Node } | null => {
  for (const st of body) {
    const decl = st.type === 'ExportNamedDeclaration' ? (st['declaration'] as Node | null) : st;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const d of decl['declarations'] as Node[]) {
      if (!binds(d['id'] as Node, name)) continue;
      const init = unwrap(d['init'] as Node | undefined);
      if ((d['id'] as Node).type === 'Identifier' && init?.type === 'ArrayExpression') return { kind: 'array', decl: d };
      return init === undefined ? null : { kind: 'other', init };
    }
  }
  return null;
};

const snippet = (code: string, node: Node): string => {
  const text = code.slice(node.start ?? 0, node.end ?? 0).replace(/\s+/g, ' ');
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
};

/** A module path from `file`, relative or through an alias, as a project file that exists. */
const resolveModule = async (file: string, spec: string, query: ListQuery): Promise<{ file: string; code: string } | null> => {
  let base: string | null = null;
  if (spec.startsWith('.')) {
    const parts = [...file.split('/').slice(0, -1), ...spec.split('/')];
    const out: string[] = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p !== '.') out.push(p);
    }
    base = out.join('/');
  } else {
    const alias = query.aliases.find((a) => spec.startsWith(a.prefix));
    if (alias !== undefined) base = `${alias.target}${spec.slice(alias.prefix.length)}`.replace(/^\.\//, '');
  }
  if (base === null) return null;
  for (const ext of EXTENSIONS) {
    const code = await query.read(base + ext);
    if (code !== null) return { file: base + ext, code };
  }
  return null;
};

/** Where the array `name` comes from, seen from `file`'s `program` and the functions around the list. */
const arrayOrigin = async (name: string, file: string, code: string, program: Node, scopes: ReadonlyArray<Node>, query: ListQuery): Promise<EmbeddedListOrigin> => {
  // The nearest function first: a callback's own parameter, then the component's.
  for (const fn of [...scopes].reverse()) {
    if (((fn['params'] as Node[] | undefined) ?? []).some((p) => binds(p, name))) {
      return { kind: 'data', reason: `the list \`${name}\` is passed in as a prop`, at: null };
    }
    const body = fn['body'] as Node | undefined;
    const found = body?.type === 'BlockStatement' ? declared(body['body'] as Node[], name) : null;
    if (found?.kind === 'array') return { kind: 'written', at: lineOf(file, found.decl), name };
    if (found?.kind === 'other') return dataFrom(name, found.init, code);
  }
  const top = declared(program['body'] as Node[], name);
  if (top?.kind === 'array') return { kind: 'written', at: lineOf(file, top.decl), name };
  if (top?.kind === 'other') return dataFrom(name, top.init, code);
  for (const st of program['body'] as Node[]) {
    if (st.type !== 'ImportDeclaration') continue;
    const spec = (st['specifiers'] as Node[]).find((s) => (s['local'] as Node)['name'] === name);
    if (spec === undefined) continue;
    const imported = spec.type === 'ImportSpecifier' ? String((spec['imported'] as Node)['name'] ?? name) : name;
    const from = String((st['source'] as Node)['value']);
    const target = await resolveModule(file, from, query);
    if (target === null) return { kind: 'data', reason: `the list \`${name}\` comes from \`${from}\`, outside your code`, at: null };
    const theirs = parseFile(target.code, target.file);
    const there = theirs === null ? null : declared(theirs['body'] as Node[], imported);
    if (there?.kind === 'array') return { kind: 'written', at: lineOf(target.file, there.decl), name: imported };
    return { kind: 'data', reason: `the list \`${name}\` isn’t written as a list in ${target.file}`, at: null };
  }
  return { kind: 'data', reason: `Scamp can’t find where the list \`${name}\` comes from`, at: null };
};

const dataFrom = (name: string, init: Node, code: string): EmbeddedListOrigin => {
  if (init.type === 'CallExpression') {
    const callee = init['callee'] as Node;
    const fn = callee.type === 'Identifier' ? String(callee['name']) : snippet(code, callee);
    if (/^use(State|Reducer)$/.test(fn)) return { kind: 'data', reason: `the list \`${name}\` is kept in state while the app runs`, at: null };
    return { kind: 'data', reason: `the list \`${name}\` comes from \`${fn}()\`, worked out while the app runs`, at: null };
  }
  return { kind: 'data', reason: `the list \`${name}\` comes from \`${snippet(code, init)}\`, worked out while the app runs`, at: null };
};

/** The `.map()` drawing the element at `source`, and where its list comes from; null when it isn't in one. */
const listAt = async (source: string, query: ListQuery): Promise<EmbeddedListOrigin | null> => {
  const at = splitSource(source);
  if (at === null) return null;
  const code = await query.read(at.file);
  const program = code === null ? null : parseFile(code, at.file);
  const found = program === null ? null : elementAt(program, at.line, at.column);
  if (code === null || program === null || found === null) return null;
  const chain = found.ancestors;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const call = chain[i];
    if (call?.type !== 'CallExpression') continue;
    const callee = call['callee'] as Node;
    if (callee.type !== 'MemberExpression' || !ITERATORS.has(String((callee['property'] as Node)['name']))) continue;
    const list = unwrap(callee['object'] as Node);
    if (list === undefined) return null;
    if (list.type === 'ArrayExpression') return { kind: 'written', at: lineOf(at.file, list), name: 'the list' };
    if (list.type !== 'Identifier') return { kind: 'data', reason: `the list comes from \`${snippet(code, list)}\`, worked out while the app runs`, at: null };
    const scopes = chain.slice(0, i).filter((n) => /Function/.test(n.type));
    return arrayOrigin(String(list['name']), at.file, code, program, scopes, query);
  }
  return null;
};

/** Where the order of the list an element is drawn by comes from: its own JSX first, then where its component is used. */
export const listOrigin = async (query: ListQuery): Promise<EmbeddedListOrigin | null> => {
  for (const source of query.sources) {
    const found = await listAt(source, query);
    if (found !== null) return found;
  }
  return null;
};

/** `paths` from a tsconfig or jsconfig, as prefixes: `"@/*": ["./src/*"]` → `@/` → `src/`. */
export const aliasesFrom = (config: string): Array<{ prefix: string; target: string }> => {
  try {
    const parsed = JSON.parse(config.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
    const base = (parsed.compilerOptions?.baseUrl ?? '.').replace(/^\.\/?/, '').replace(/\/?$/, '/').replace(/^\/$/, '');
    return Object.entries(parsed.compilerOptions?.paths ?? {})
      .filter(([key, to]) => key.endsWith('/*') && to[0]?.endsWith('/*') === true)
      .map(([key, to]) => ({ prefix: key.slice(0, -1), target: `${base}${(to[0] ?? '').slice(0, -1).replace(/^\.\//, '')}` }));
  } catch {
    return [];
  }
};
