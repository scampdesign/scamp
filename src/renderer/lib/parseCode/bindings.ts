// Binding pre-pass for parseCode. The generator writes five binding
// forms (see docs/notes/view-bindings.md) that an HTML tokenizer can't
// read: `attr={expr}`, `onX={…}`, `{list.map((row) => (…))}`, and
// `{flag && (…)}`. This module rewrites them into tokenizer-safe
// forms before the structural parse — braced attribute values become
// quoted values carrying a marker, and the two wrappers become
// `<scamp-repeat>` / `<scamp-show>` pseudo-tags — and decodes them
// afterwards. It also reads the function-signature destructure, whose
// defaults are the sample data.
import { findMatchingBrace, findOpeningTagClose, splitTopLevel } from '../jsxScan';
import { applyRewrites, composeMaps, type SourceMap } from '../sourceMap';
import type { RepeatBinding, SampleRow, SampleValue } from '../element';

/** Prefix on a quoted attribute value that was `{expr}` in the source. */
export const BIND_MARK = '__scamp_bind__:';

export const REPEAT_TAG = 'scamp-repeat';
export const SHOW_TAG = 'scamp-show';

const REPEAT_OPEN_RE =
  /^(\s*)\{([A-Za-z_$][\w$]*)\.map\(\(([A-Za-z_$][\w$]*)\) => \($/;
const SHOW_OPEN_RE = /^(\s*)\{(!?[A-Za-z_$][\w$]*)\s*&&\s*\($/;

/**
 * Rewrite the repeat and show wrappers into pseudo-tags. The generator
 * puts each opener and its closer on their own lines at the same
 * indent, with the wrapped element indented one level deeper, so the
 * closer is the first `))}` / `)}` line back at the opener's indent.
 */
const hoistWrappers = (tsx: string): { text: string; map: SourceMap } => {
  const lines = tsx.split('\n');
  const open: Array<{ indent: string; closer: RegExp; tag: string }> = [];
  const rewrites: Array<{ start: number; end: number; text: string }> = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineStart = offset;
    offset += line.length + 1;
    const replace = (text: string): void => {
      rewrites.push({ start: lineStart, end: lineStart + line.length, text });
    };
    const top = open[open.length - 1];
    if (top && top.closer.test(line)) {
      replace(`${top.indent}</${top.tag}>`);
      open.pop();
      continue;
    }
    const repeat = REPEAT_OPEN_RE.exec(line);
    if (repeat) {
      const [, indent = '', over = '', as = ''] = repeat;
      replace(`${indent}<${REPEAT_TAG} over="${over}" as="${as}">`);
      open.push({ indent, closer: new RegExp(`^${indent}\\)\\)\\}\\s*$`), tag: REPEAT_TAG });
      continue;
    }
    const show = SHOW_OPEN_RE.exec(line);
    if (show) {
      const [, indent = '', flag = ''] = show;
      replace(`${indent}<${SHOW_TAG} if="${flag}">`);
      open.push({ indent, closer: new RegExp(`^${indent}\\)\\}\\s*$`), tag: SHOW_TAG });
    }
  }
  return applyRewrites(tsx, rewrites);
};

/**
 * Quote braced attribute values on Scamp elements and instances so the
 * tokenizer keeps them whole: `href={url}` → `href="<mark>url"`. JSX
 * values (`left={<…>}`), `className={styles.x}`, and anything holding a
 * brace or quote are left alone.
 */
const hoistAttributeExpressions = (
  tsx: string
): { text: string; map: SourceMap } => {
  const idRe = /data-scamp-(?:id|instance-id)\s*=\s*"/g;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (let m = idRe.exec(tsx); m !== null; m = idRe.exec(tsx)) {
    const tagOpen = tsx.lastIndexOf('<', m.index);
    if (tagOpen < 0) continue;
    const tagClose = findOpeningTagClose(tsx, tagOpen);
    if (tagClose < 0) continue;
    idRe.lastIndex = tagClose;
    const openTag = tsx.slice(tagOpen, tagClose + 1);
    // `>` is allowed inside the braces (`() => …`); `<` would be JSX.
    // Quotes are escaped, not refused: `{on === "true"}` left raw is split at its spaces.
    const attrRe = /(\s)([A-Za-z_][\w-]*)=\{([^{}<]*)\}/g;
    const rewritten = openTag.replace(attrRe, (whole, ws: string, name: string, expr: string) => {
      const trimmed = expr.trim();
      if (trimmed.startsWith('styles.') || trimmed.length === 0) return whole;
      const quoted = trimmed.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return `${ws}${name}="${BIND_MARK}${quoted}"`;
    });
    if (rewritten !== openTag) edits.push({ start: tagOpen, end: tagClose + 1, text: rewritten });
  }
  return applyRewrites(tsx, edits);
};

/**
 * Both rewrites, with the offsets to read the result's positions back
 * as positions in the file as written. Run after `hoistNamedSlots`.
 */
export const hoistBindingsWithMap = (
  tsx: string
): { text: string; map: SourceMap } => {
  const wrapped = hoistWrappers(tsx);
  const attributed = hoistAttributeExpressions(wrapped.text);
  return {
    text: attributed.text,
    map: composeMaps(wrapped.map, attributed.map),
  };
};

export const hoistBindings = (tsx: string): string =>
  hoistBindingsWithMap(tsx).text;

export type DecodedBinding =
  | { kind: 'bind'; expr: string }
  | { kind: 'event'; handler: string; rowKey: string | null }
  | { kind: 'verbatim'; expr: string };

const PATH_RE = /^!?[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/;
const EVENT_IN_REPEAT_RE = /^\(\)\s*=>\s*([A-Za-z_$][\w$]*)\?\.\(([A-Za-z_$][\w$]*)\.([\w$]+)\)$/;
const isEventAttr = (attr: string): boolean => /^on[A-Z]/.test(attr);

/**
 * Read a marked attribute value back. Returns null when the value
 * wasn't marked (an ordinary string attribute).
 */
export const decodeBinding = (attr: string, value: string): DecodedBinding | null => {
  if (!value.startsWith(BIND_MARK)) return null;
  const expr = value.slice(BIND_MARK.length);
  if (isEventAttr(attr)) {
    const inRepeat = EVENT_IN_REPEAT_RE.exec(expr);
    if (inRepeat) return { kind: 'event', handler: inRepeat[1] ?? '', rowKey: inRepeat[3] ?? null };
    if (/^[A-Za-z_$][\w$]*$/.test(expr)) return { kind: 'event', handler: expr, rowKey: null };
    return { kind: 'verbatim', expr };
  }
  if (PATH_RE.test(expr)) return { kind: 'bind', expr };
  return { kind: 'verbatim', expr };
};

/** Decode `over="…" as="…"` from the repeat pseudo-tag's attributes. */
export const repeatFromAttribs = (attribs: Record<string, string>): RepeatBinding | null => {
  const over = attribs['over'];
  const as = attribs['as'];
  if (!over || !as) return null;
  return { over, as };
};

// ---- the destructure ------------------------------------------------

const decodeTsString = (raw: string): string =>
  raw.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

const parseScalar = (raw: string): string | number | boolean | null => {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const str = /^"((?:\\.|[^"\\])*)"$/.exec(s);
  if (str) return decodeTsString(str[1] ?? '');
  return null;
};

/** `{ id: "1", label: "Alex", count: 3 }` → a sample row, or null. */
const parseRow = (raw: string): SampleRow | null => {
  const s = raw.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return null;
  const row: SampleRow = {};
  for (const entry of splitTopLevel(s.slice(1, -1))) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*?)\s*$/.exec(entry);
    if (!m) return null;
    const value = parseScalar(m[2] ?? '');
    if (typeof value === 'boolean' || value === null) return null;
    row[m[1] ?? ''] = value;
  }
  return row;
};

const parseDefault = (raw: string): SampleValue | null => {
  const s = raw.trim();
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) return null;
    const rows: SampleRow[] = [];
    for (const entry of splitTopLevel(s.slice(1, -1))) {
      const row = parseRow(entry);
      if (row === null) return null;
      rows.push(row);
    }
    return rows;
  }
  const scalar = parseScalar(s);
  if (typeof scalar === 'number') return String(scalar);
  return scalar;
};

/**
 * Every `name = default` pair in the default export's destructure —
 * strings, booleans, and arrays of rows — plus bare names (events,
 * slots, `className`) mapped to `undefined`. Empty for a page.
 */
export const parsePropsDefaults = (tsx: string): Map<string, SampleValue | undefined> => {
  const out = new Map<string, SampleValue | undefined>();
  const fn = /export\s+default\s+function\s+\w+\s*\(/.exec(tsx);
  if (!fn) return out;
  const openBrace = tsx.indexOf('{', fn.index + fn[0].length);
  if (openBrace < 0) return out;
  const between = tsx.slice(fn.index + fn[0].length, openBrace);
  if (between.trim().length > 0) return out; // `(props)` — not a destructure
  const closeBrace = findMatchingBrace(tsx, openBrace);
  if (closeBrace < 0) return out;
  const inner = tsx.slice(openBrace + 1, closeBrace);
  for (const entry of splitTopLevel(inner)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*(?:=\s*([\s\S]*?))?\s*$/.exec(entry);
    if (!m || !m[1]) continue;
    if (m[2] === undefined) {
      out.set(m[1], undefined);
      continue;
    }
    const value = parseDefault(m[2]);
    if (value !== null) out.set(m[1], value);
  }
  return out;
};
