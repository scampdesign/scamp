import { parse } from '@babel/parser';

import type { EmbeddedContentField, EmbeddedContentOrigin } from '@shared/types';

/**
 * Where an element's text, image, or link comes from, read from its JSX:
 * written in the code (editable), passed in as a prop with a value written
 * where the component is used (editable there), or data (not editable from
 * Scamp: a list item, state, an API, an expression). When the parse can't
 * decide, it says so, and Scamp treats it as data. Pure apart from `read`.
 * see docs/plans/embedded-canvas-gaps.md (P5)
 */

type Node = { type: string; start?: number | null; end?: number | null; loc?: { start: { line: number; column: number } } | null; [key: string]: unknown };

/** Where a component is used, from React's props in the page (`data-scamp-call`), innermost first. */
export type ComponentCall = { name: string; call: string | null };

export type ContentQuery = {
  /** `src/Card.jsx:4:5`: the element's opening tag, column 1-based. */
  source: string;
  field: EmbeddedContentField;
  calls: ReadonlyArray<ComponentCall>;
  /** Reads a project file by its project-relative path; null when it can't. */
  read: (file: string) => Promise<string | null>;
};

const MAX_HOPS = 3;

const parseFile = (code: string, file: string): Node | null => {
  try {
    // The program, not the File around it: imports and top-level consts are its body.
    return parse(code, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: /\.tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
    }).program as unknown as Node;
  } catch {
    return null;
  }
};

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

/** Every node with its chain of ancestors, outermost first. */
const walk = (root: Node, visit: (node: Node, ancestors: Node[]) => boolean | void): void => {
  const go = (node: Node, ancestors: Node[]): boolean => {
    if (visit(node, ancestors) === true) return true;
    const next = [...ancestors, node];
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments') continue;
      const value = node[key];
      const kids = Array.isArray(value) ? value : [value];
      for (const kid of kids) if (isNode(kid) && go(kid, next)) return true;
    }
    return false;
  };
  go(root, []);
};

/** The JSX element whose opening tag starts at `line`:`column` (1-based), with its ancestors. */
const elementAt = (root: Node, line: number, column: number): { element: Node; ancestors: Node[] } | null => {
  let found: { element: Node; ancestors: Node[] } | null = null;
  walk(root, (node, ancestors) => {
    if (node.type !== 'JSXElement') return;
    const opening = node['openingElement'] as Node | undefined;
    const at = opening?.loc?.start;
    if (at !== undefined && at.line === line && at.column + 1 === column) {
      found = { element: node, ancestors };
      return true;
    }
  });
  return found;
};

const splitSource = (source: string): { file: string; line: number; column: number } | null => {
  const m = /^(.+):(\d+):(\d+)$/.exec(source);
  return m === null ? null : { file: m[1] ?? '', line: Number(m[2]), column: Number(m[3]) };
};

const where = (file: string, node: Node): string => `${file}:${node.loc?.start.line ?? 0}`;

/** A string an expression is, when it's written as one: `"x"`, `'x'`, or a template with no `${}`. */
const literalString = (node: Node | undefined): string | null => {
  if (node === undefined) return null;
  if (node.type === 'StringLiteral') return String(node['value']);
  if (node.type === 'TemplateLiteral' && (node['expressions'] as unknown[]).length === 0) {
    const quasis = node['quasis'] as Array<{ value: { cooked: string } }>;
    return quasis.map((q) => q.value.cooked).join('');
  }
  return null;
};

/** The name a component function is declared under: `function Card`, `const Card = () =>`. */
const componentName = (fn: Node, parent: Node | undefined): string | null => {
  const id = fn['id'] as Node | null | undefined;
  if (id?.type === 'Identifier') return String(id['name']);
  if (parent?.type === 'VariableDeclarator') {
    const vid = parent['id'] as Node | undefined;
    if (vid?.type === 'Identifier') return String(vid['name']);
  }
  return null;
};

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

type Resolved =
  | { kind: 'literal'; value: string; at: string }
  | { kind: 'import'; value: string; at: string }
  | { kind: 'prop'; prop: string; component: string }
  | { kind: 'data'; reason: string };

/** What an expression in the element's JSX is: a literal, a prop of its component, an import, or data. */
const resolveExpression = (expr: Node, ancestors: Node[], program: Node, file: string): Resolved => {
  const literal = literalString(expr);
  if (literal !== null) return { kind: 'literal', value: literal, at: where(file, expr) };
  // `props.title`, with `props` the component's first parameter.
  if (expr.type === 'MemberExpression' && (expr['object'] as Node).type === 'Identifier' && (expr['property'] as Node).type === 'Identifier' && expr['computed'] !== true) {
    const object = String((expr['object'] as Node)['name']);
    const prop = String((expr['property'] as Node)['name']);
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      const fn = ancestors[i];
      if (fn === undefined || !FUNCTIONS.has(fn.type)) continue;
      const first = (fn['params'] as Node[])[0];
      if (first?.type === 'Identifier' && first['name'] === object) {
        const name = componentName(fn, ancestors[i - 1]);
        return name === null ? { kind: 'data', reason: 'it’s an expression' } : { kind: 'prop', prop, component: name };
      }
    }
    return { kind: 'data', reason: 'it’s an expression' };
  }
  if (expr.type !== 'Identifier') return { kind: 'data', reason: 'it’s an expression' };
  const name = String(expr['name']);
  // The nearest function that binds the name: a component's destructured prop, or a callback's item (data).
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const fn = ancestors[i];
    if (fn === undefined || !FUNCTIONS.has(fn.type)) continue;
    const params = fn['params'] as Node[];
    const first = params[0];
    const destructured =
      first?.type === 'ObjectPattern' &&
      (first['properties'] as Node[]).some((p) => {
        if (p.type !== 'ObjectProperty') return false;
        const value = p['value'] as Node;
        const bound = value.type === 'AssignmentPattern' ? (value['left'] as Node) : value;
        return bound.type === 'Identifier' && bound['name'] === name;
      });
    if (destructured) {
      const component = componentName(fn, ancestors[i - 1]);
      return component === null ? { kind: 'data', reason: 'it comes from a function’s arguments' } : { kind: 'prop', prop: name, component };
    }
    if (params.some((p) => p.type === 'Identifier' && p['name'] === name)) return { kind: 'data', reason: 'it comes from data, such as a list being drawn' };
    // A `const` written with a string, in the component.
    const body = fn['body'] as Node;
    const local = constString(body, name, file);
    if (local !== null) return local;
  }
  const top = constString(program, name, file) ?? importOf(program, name, file);
  return top ?? { kind: 'data', reason: 'it comes from a variable' };
};

const constString = (scope: Node, name: string, file: string): Resolved | null => {
  const statements = (scope['body'] as Node[] | undefined) ?? [];
  if (!Array.isArray(statements)) return null;
  for (const st of statements) {
    const decl = st.type === 'ExportNamedDeclaration' ? (st['declaration'] as Node | null) : st;
    if (decl?.type !== 'VariableDeclaration' || decl['kind'] !== 'const') continue;
    for (const d of decl['declarations'] as Node[]) {
      const id = d['id'] as Node;
      if (id.type !== 'Identifier' || id['name'] !== name) continue;
      const value = literalString(d['init'] as Node | undefined);
      return value === null ? { kind: 'data', reason: 'it comes from a variable' } : { kind: 'literal', value, at: where(file, d) };
    }
  }
  return null;
};

const importOf = (program: Node, name: string, file: string): Resolved | null => {
  for (const st of program['body'] as Node[]) {
    if (st.type !== 'ImportDeclaration') continue;
    for (const spec of st['specifiers'] as Node[]) {
      if ((spec['local'] as Node)['name'] === name) return { kind: 'import', value: String((st['source'] as Node)['value']), at: where(file, st) };
    }
  }
  return null;
};

/** The element's text, when it's only text or one expression; null when it has elements inside. */
const textOf = (element: Node): Node | 'text' | 'mixed' | 'empty' => {
  const kids = (element['children'] as Node[]).filter((k) => !(k.type === 'JSXText' && String(k['value']).trim() === ''));
  if (kids.length === 0) return 'empty';
  if (kids.every((k) => k.type === 'JSXText')) return 'text';
  if (kids.length === 1 && kids[0]?.type === 'JSXExpressionContainer') return kids[0]['expression'] as Node;
  return 'mixed';
};

const attributeOf = (element: Node, name: string): Node | 'missing' | 'spread' => {
  const attrs = (element['openingElement'] as Node)['attributes'] as Node[];
  const attr = attrs.find((a) => a.type === 'JSXAttribute' && (a['name'] as Node)['name'] === name);
  if (attr !== undefined) {
    const value = attr['value'] as Node | null;
    if (value === null) return { type: 'StringLiteral', value: '' } as Node;
    return value.type === 'JSXExpressionContainer' ? (value['expression'] as Node) : value;
  }
  return attrs.some((a) => a.type === 'JSXSpreadAttribute') ? 'spread' : 'missing';
};

/** One step: the content of `field` on the element at `source`. */
const contentAt = async (query: ContentQuery, source: string, field: EmbeddedContentField, attrName: string | null): Promise<Resolved> => {
  const at = splitSource(source);
  if (at === null) return { kind: 'data', reason: 'Scamp couldn’t find where it’s written' };
  const code = await query.read(at.file);
  const program = code === null ? null : parseFile(code, at.file);
  const hit = program === null ? null : elementAt(program, at.line, at.column);
  if (program === null || hit === null) return { kind: 'data', reason: 'Scamp couldn’t read the code there' };
  const { element, ancestors } = hit;
  // Text a component renders as `{children}` is written between its tags where it's used.
  if (field === 'text' && (attrName === null || attrName === 'children')) {
    const text = textOf(element);
    if (text === 'text') {
      const raw = (element['children'] as Node[]).map((k) => String(k['value'] ?? '')).join('');
      return { kind: 'literal', value: raw.replace(/\s+/g, ' ').trim(), at: where(at.file, element) };
    }
    if (text === 'empty') return { kind: 'literal', value: '', at: where(at.file, element) };
    if (text === 'mixed') return { kind: 'data', reason: 'it mixes text with other elements or values' };
    return resolveExpression(text, [...ancestors, element], program, at.file);
  }
  const attr = attributeOf(element, attrName ?? field);
  // No attribute yet: one can be added where the element is written.
  if (attr === 'missing') return { kind: 'literal', value: '', at: where(at.file, element) };
  if (attr === 'spread') return { kind: 'data', reason: 'it may come from props spread onto the element' };
  return resolveExpression(attr, [...ancestors, element], program, at.file);
};

/** Where the content of `field` on the element comes from, following props to where components are used. */
export const classifyContent = async (query: ContentQuery): Promise<EmbeddedContentOrigin> => {
  let result = await contentAt(query, query.source, query.field, null);
  let via: { prop: string; component: string } | null = null;
  for (let hop = 0; hop < MAX_HOPS && result.kind === 'prop'; hop += 1) {
    const { prop, component } = result;
    via ??= { prop, component };
    const call = query.calls.find((c) => c.name === component)?.call ?? null;
    if (call === null) return { kind: 'unknown', reason: `Scamp can’t see where ${component} is used, to tell where its ${prop} comes from` };
    result = await contentAt(query, call, query.field, prop);
  }
  if (result.kind === 'prop') return { kind: 'unknown', reason: 'it’s passed through too many components to follow' };
  if (result.kind === 'data') return { kind: 'data', reason: result.reason };
  if (via !== null) return { kind: 'prop', value: result.value, at: result.at, prop: via.prop, component: via.component };
  return result.kind === 'import' ? { kind: 'import', value: result.value, at: result.at } : { kind: 'literal', value: result.value, at: result.at };
};

/**
 * A file name not already in `taken`, compared without case (macOS folders
 * ignore it): `logo.png`, then `logo-2.png`, and so on. Spaces become dashes,
 * so the name works as a URL.
 */
export const freeFileName = (name: string, taken: ReadonlyArray<string>): string => {
  const clean = name.trim().replace(/\s+/g, '-') || 'image';
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  const used = new Set(taken.map((t) => t.toLowerCase()));
  let candidate = clean;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${stem}-${n}${ext}`;
  return candidate;
};
