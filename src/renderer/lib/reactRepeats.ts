// @lib/reactRepeats.ts — a React app's lists, as repeats.
//
// A list the app draws with `.map()` arrives as one element per row: a
// table of 21 claims is 21 copies of the row. React says which siblings
// came from one `.map()` — they share a JSX call site (React 19), or they
// carry the `key` React requires on every element of a list. A run of
// those siblings that look alike becomes ONE element with
// `repeat: { over, as }`, the rows as samples on the root, and whatever
// differs between them — words, an image, a link, an instance's props —
// as row fields.
//
// Pure. Runs after `@lib/reactComponents`, on each view and on each
// component it made.
// see docs/plans/react-import-plan.md, docs/notes/view-bindings.md

import type { CapturedReact } from '@shared/importCapture';

import type { SampleRow, ScampElement } from './element';

export type RepeatTree = {
  elements: Record<string, ScampElement>;
  rootId: string;
  /** React's account of each element, by element id. */
  react: Readonly<Record<string, CapturedReact>>;
};

/** What a `.map()` call site's source line says: `navItems.map((item) =>`. */
export type ListSource = { over: string; as: string };

export type PlannedRepeat = { over: string; as: string; rows: number; fields: string[] };

export type RepeatPlan = {
  elements: Record<string, ScampElement>;
  repeats: PlannedRepeat[];
  /** Lists left as copies because their rows look different, and in what. */
  skipped: Array<{ list: string; rows: number; differs: string }>;
};

export type RepeatOptions = {
  /** The list and row names read from each call site's source, by site. */
  sources?: Readonly<Record<string, ListSource>>;
  /** Names the root's props already use. */
  takenNames?: ReadonlyArray<string>;
};

/** What a row may differ in; anything else differing means it isn't the same template. */
const ROW_FIELDS_NOT_LOOK: ReadonlySet<string> = new Set([
  'id',
  'parentId',
  'childIds',
  'text',
  'x',
  'y',
  'name',
  'prop',
  'attributes',
  'propOverrides',
  'src',
  'alt',
  'instanceId',
  'widthMode',
  'widthValue',
  'widthCustom',
  'heightMode',
  'heightValue',
  'heightCustom',
]);

const lookKey = (el: ScampElement): string => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(el).sort()) {
    if (!ROW_FIELDS_NOT_LOOK.has(key)) out[key] = (el as unknown as Record<string, unknown>)[key];
  }
  return JSON.stringify(out);
};

/** The first field a row's look differs from the first row's in, `field on element`; null when none does. */
const lookDifference = (elements: Readonly<Record<string, ScampElement>>, positions: ReadonlyArray<ReadonlyArray<string>>): string | null => {
  const template = positions[0] ?? [];
  for (let p = 0; p < template.length; p += 1) {
    const a = elements[template[p] as string] as unknown as Record<string, unknown>;
    for (const ids of positions.slice(1)) {
      const b = elements[ids[p] as string] as unknown as Record<string, unknown>;
      for (const key of Object.keys({ ...a, ...b })) {
        if (ROW_FIELDS_NOT_LOOK.has(key)) continue;
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return `${key} on ${String(a['name'] ?? a['id'])}`;
      }
    }
  }
  return null;
};

const shapeOf = (elements: Readonly<Record<string, ScampElement>>, id: string): string => {
  const el = elements[id];
  if (el === undefined) return '';
  return `${el.type}:${el.tag ?? ''}[${el.childIds.map((c) => shapeOf(elements, c)).join(',')}]`;
};

const preorder = (elements: Readonly<Record<string, ScampElement>>, id: string, out: string[] = []): string[] => {
  out.push(id);
  for (const c of elements[id]?.childIds ?? []) preorder(elements, c, out);
  return out;
};

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const RESERVED: ReadonlySet<string> = new Set(['className', 'children', 'key', 'ref', 'style', 'id']);

/** `dp_nav_label` → `navLabel`; a short leading namespace (`dp`, `os`) is dropped. */
export const fieldNameFrom = (raw: string | undefined, fallback: string): string => {
  const words = (raw ?? '').split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0);
  while (words.length > 1 && (words[0]?.length ?? 0) <= 2) words.shift();
  const name = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return IDENTIFIER.test(name) && !RESERVED.has(name) ? name : fallback;
};

const unique = (base: string, taken: Set<string>): string => {
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}${n}`;
  taken.add(name);
  return name;
};

/**
 * Why these siblings would be one `.map()`, or null when nothing says so:
 * one call site; or a key on each, with one owner writing them all; or
 * each the keyed root of an instance of the same component.
 */
const listSignal = (react: CapturedReact | undefined, parentOwners: ReadonlySet<string>): string | null => {
  if (react === undefined) return null;
  if (react.site !== undefined) return `site:${react.site}`;
  const nearest = react.owners[0];
  if (react.key !== undefined && nearest !== undefined) return `key:${nearest.id}`;
  if (nearest !== undefined && nearest.key !== undefined && !parentOwners.has(String(nearest.id))) {
    return `component:${nearest.name}`;
  }
  return null;
};

/** The repeats in one element tree: each run of `.map()` siblings that look alike. */
export const planRepeats = (tree: RepeatTree, options: RepeatOptions = {}): RepeatPlan => {
  const elements: Record<string, ScampElement> = { ...tree.elements };
  const repeats: PlannedRepeat[] = [];
  const skipped: RepeatPlan['skipped'] = [];
  const root = elements[tree.rootId];
  if (root === undefined) return { elements, repeats, skipped };
  const taken = new Set<string>([...(options.takenNames ?? []), ...Object.keys(root.samples ?? {})]);
  const samples: Record<string, SampleRow[]> = {};

  // Parents first, so a list inside a list's row is seen once the outer
  // one has settled; a run is only ever made of elements still present.
  for (const parentId of preorder(elements, tree.rootId)) {
    const parent = elements[parentId];
    if (parent === undefined || parent.childIds.length < 2) continue;
    const parentOwners = new Set((tree.react[parentId]?.owners ?? []).map((o) => String(o.id)));

    // Runs of neighbours with the same signal.
    const runs: string[][] = [];
    let current: string[] = [];
    let currentSignal: string | null = null;
    for (const childId of parent.childIds) {
      const signal = listSignal(tree.react[childId], parentOwners);
      if (signal !== null && signal === currentSignal) current.push(childId);
      else {
        if (current.length >= 2) runs.push(current);
        current = signal === null ? [] : [childId];
        currentSignal = signal;
      }
    }
    if (current.length >= 2) runs.push(current);

    for (const run of runs) {
      const first = run[0] as string;
      const firstReact = tree.react[first];
      // Rows built from one template: the same shape, the same look at
      // every position. A row that differs in look (a status chip's
      // colour) isn't the same template, and the list stays as copies.
      const shape = shapeOf(elements, first);
      const positions = run.map((id) => preorder(elements, id));
      const listLabel = elements[first]?.componentName ?? elements[first]?.name ?? 'list';
      const differs = run.every((id) => shapeOf(elements, id) === shape) ? lookDifference(elements, positions) : 'shape';
      if (differs !== null) {
        skipped.push({ list: listLabel, rows: run.length, differs });
        continue;
      }

      // The list's names: from the source when it was read, else from the row.
      const source = firstReact?.site !== undefined ? options.sources?.[firstReact.site] : undefined;
      const rowWord = fieldNameFrom(elements[first]?.componentName ?? elements[first]?.name, 'item');
      const over = unique(source?.over ?? `${rowWord}s`, taken);
      const as = source?.as !== undefined && source.as !== over ? source.as : rowWord === over ? 'row' : rowWord;

      // What differs between rows becomes a field; what doesn't stays put.
      const fieldNames = new Set<string>();
      const rows: SampleRow[] = run.map(() => ({}));
      const template = positions[0] as string[];
      const patches = new Map<string, Partial<ScampElement>>();
      const patch = (id: string, change: Partial<ScampElement>): void => {
        patches.set(id, { ...(patches.get(id) ?? {}), ...change });
      };
      const addField = (base: string, values: string[]): string => {
        const name = unique(base, fieldNames);
        values.forEach((v, i) => {
          (rows[i] as SampleRow)[name] = v;
        });
        return name;
      };
      template.forEach((templateId, p) => {
        const atP = positions.map((ids) => elements[ids[p] as string] as ScampElement);
        const el = atP[0] as ScampElement;
        // Words.
        const texts = atP.map((e) => e.text ?? '');
        if (el.type === 'text' && el.prop === undefined && texts.some((t) => t !== texts[0])) {
          const field = addField(fieldNameFrom(el.name, 'text'), texts);
          patch(templateId, { prop: `${as}.${field}`, text: undefined });
        }
        // An instance's props.
        if (el.type === 'component-instance') {
          const names = new Set(atP.flatMap((e) => Object.keys(e.propOverrides ?? {})));
          const bind: Record<string, string> = { ...(el.bind ?? {}) };
          const overrides: Record<string, string> = { ...(el.propOverrides ?? {}) };
          for (const name of names) {
            const values = atP.map((e) => e.propOverrides?.[name] ?? '');
            if (values.every((v) => v === values[0])) continue;
            bind[name] = `${as}.${addField(name, values)}`;
            delete overrides[name];
          }
          if (Object.keys(bind).length > 0) patch(templateId, { bind, propOverrides: overrides });
        }
        // Attributes, and an image's own src and alt.
        const attrNames = new Set(atP.flatMap((e) => Object.keys(e.attributes ?? {})));
        const bind: Record<string, string> = { ...(patches.get(templateId)?.bind ?? el.bind ?? {}) };
        for (const name of attrNames) {
          const values = atP.map((e) => e.attributes?.[name] ?? '');
          if (values.every((v) => v === values[0])) continue;
          bind[name] = `${as}.${addField(fieldNameFrom(name, 'value'), values)}`;
        }
        for (const typed of ['src', 'alt'] as const) {
          const values = atP.map((e) => e[typed] ?? '');
          if (values.every((v) => v === values[0])) continue;
          bind[typed] = `${as}.${addField(typed, values)}`;
        }
        if (Object.keys(bind).length > 0) patch(templateId, { bind });
        // A size that differs by row is the row's content showing through.
        for (const axis of ['width', 'height'] as const) {
          const mode = `${axis}Mode` as const;
          const value = `${axis}Value` as const;
          const keyOf = (e: ScampElement): string => `${e[mode]}:${e[mode] === 'fixed' ? e[value] : ''}`;
          if (atP.some((e) => keyOf(e) !== keyOf(el))) {
            patch(templateId, {
              [mode]: atP.some((e) => e[mode] === 'stretch') ? 'stretch' : 'auto',
              [`${axis}Custom`]: undefined,
            } as Partial<ScampElement>);
          }
        }
      });
      if (fieldNames.size === 0) {
        // Rows with nothing to tell them apart: still one template, drawn
        // as many times as the page drew it.
        rows.forEach((row, i) => {
          row['index'] = i + 1;
        });
        fieldNames.add('index');
      }
      // The key: a field every row holds a different value of, else a number.
      const keyField = [...fieldNames].find((f) => new Set(rows.map((r) => String(r[f]))).size === rows.length);
      if (keyField === undefined) rows.forEach((row, i) => (row['id'] = String(i + 1)));

      for (const [id, change] of patches) {
        const el = elements[id];
        if (el !== undefined) elements[id] = { ...el, ...change };
      }
      elements[first] = {
        ...(elements[first] as ScampElement),
        repeat: { over, as, ...(keyField !== undefined && keyField !== 'id' ? { key: keyField } : {}) },
      };
      for (const ids of positions.slice(1)) for (const id of ids) delete elements[id];
      const latest = elements[parentId] as ScampElement;
      elements[parentId] = { ...latest, childIds: latest.childIds.filter((c) => c === first || !run.includes(c)) };
      samples[over] = rows;
      repeats.push({ over, as, rows: rows.length, fields: [...fieldNames] });
    }
  }

  if (repeats.length > 0) {
    const latestRoot = elements[tree.rootId] as ScampElement;
    elements[tree.rootId] = { ...latestRoot, samples: { ...(latestRoot.samples ?? {}), ...samples } };
  }
  return { elements, repeats, skipped };
};
