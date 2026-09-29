/**
 * A text element's content as a list of styled RUNS rather than a
 * string.
 *
 * `alongside` in "works alongside AI" is not a box inside the headline —
 * it is three words that are a different colour. Modelling it as a child
 * element is what forces the "a host with children cannot also hold
 * words" rule, which splits the sentence, which is how the spaces around
 * it get lost. Runs keep the sentence one element.
 *
 * **Phase 1 stores nothing.** `ScampElement.runs` is optional and
 * nothing writes it yet; `runsOf` treats an absent list as one unstyled
 * run of the element's `text`, so every existing element already has a
 * runs view and no file changes. The operations below are the half that
 * later phases need and that can be built and tested now.
 * see docs/plans/inline-spans-plan.md
 */

/**
 * Style a run may carry.
 *
 * Deliberately only properties that paint GLYPHS. Anything affecting
 * layout — margin, width, display — is an element, not a run, and
 * putting it here would let the panel write CSS that silently does
 * nothing inside a line.
 */
export type TextRunStyle = {
  color?: string;
  /** Gradient text: a background clipped to the glyphs. */
  backgroundImage?: string;
  fontWeight?: number;
  fontStyle?: string;
  textDecorationLine?: string;
  /** Anything the typed fields do not cover, as CSS. */
  customProperties?: Record<string, string>;
};

export type TextRun = {
  text: string;
  /** Absent for the unstyled majority. */
  style?: TextRunStyle;
  /** A run can be a link without becoming its own element. */
  href?: string;
};

/** Does this run paint differently from plain text? */
export const isStyled = (run: TextRun): boolean =>
  run.href !== undefined ||
  (run.style !== undefined && Object.keys(run.style).length > 0);

/** One unstyled run. The shape every plain text element implies. */
export const runsFromText = (text: string): TextRun[] => [{ text }];

/** The words, with every run's styling dropped. */
export const textFromRuns = (runs: ReadonlyArray<TextRun>): string =>
  runs.map((run) => run.text).join('');

/**
 * The runs view of an element that may not store any.
 *
 * An element with no `runs` is one unstyled run of its `text`, which is
 * every element in every project today.
 */
export const runsOf = (element: {
  runs?: ReadonlyArray<TextRun>;
  text?: string | null;
}): TextRun[] => {
  if (element.runs !== undefined && element.runs.length > 0) {
    return element.runs.map((run) => ({ ...run }));
  }
  return runsFromText(element.text ?? '');
};

/** Are two runs identical apart from their words? */
const sameStyle = (a: TextRun, b: TextRun): boolean =>
  a.href === b.href && JSON.stringify(a.style ?? {}) === JSON.stringify(b.style ?? {});

/**
 * Join neighbours that paint the same, and drop empties.
 *
 * Without this every edit leaves a seam: styling "AI" and then unstyling
 * it gives three runs that render exactly like one, and the next split
 * happens at a boundary the user cannot see.
 */
export const mergeRuns = (runs: ReadonlyArray<TextRun>): TextRun[] => {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const last = out[out.length - 1];
    if (last !== undefined && sameStyle(last, run)) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
      continue;
    }
    out.push({ ...run });
  }
  // Never return nothing: a text element with no runs has no content,
  // and callers expect at least the empty string.
  return out.length > 0 ? out : [{ text: '' }];
};

/**
 * Split the list at a character offset, so a boundary exists there.
 *
 * Offsets are over the JOINED text — what a DOM selection reports — not
 * over run indices, which the caller has no way to know.
 */
export const splitAt = (runs: ReadonlyArray<TextRun>, offset: number): TextRun[] => {
  if (offset <= 0) return runs.map((run) => ({ ...run }));
  const out: TextRun[] = [];
  let seen = 0;
  for (const run of runs) {
    const end = seen + run.text.length;
    if (offset > seen && offset < end) {
      const cut = offset - seen;
      out.push({ ...run, text: run.text.slice(0, cut) });
      out.push({ ...run, text: run.text.slice(cut) });
    } else {
      out.push({ ...run });
    }
    seen = end;
  }
  return out;
};

/**
 * Apply a style to the characters between two offsets.
 *
 * The range is split out first, so only the covered runs change, then
 * the result is merged — styling a range and undoing it has to give back
 * the list you started with, or the model accumulates seams.
 *
 * `style` is merged into whatever a covered run already had, so making a
 * bold word red keeps it bold. Pass `null` for a property to clear it.
 */
export const applyStyleToRange = (
  runs: ReadonlyArray<TextRun>,
  start: number,
  end: number,
  style: Readonly<Record<string, string | number | null>>
): TextRun[] => {
  if (end <= start) return mergeRuns(runs);
  const split = splitAt(splitAt(runs, start), end);
  const out: TextRun[] = [];
  let seen = 0;
  for (const run of split) {
    const runEnd = seen + run.text.length;
    const covered = seen >= start && runEnd <= end && run.text.length > 0;
    if (!covered) {
      out.push(run);
      seen = runEnd;
      continue;
    }
    const next: Record<string, unknown> = { ...(run.style ?? {}) };
    for (const [prop, value] of Object.entries(style)) {
      if (value === null) delete next[prop];
      else next[prop] = value;
    }
    const styled = Object.keys(next).length > 0;
    out.push({
      ...run,
      ...(styled ? { style: next as TextRunStyle } : {}),
      ...(styled ? {} : { style: undefined }),
    });
    seen = runEnd;
  }
  return mergeRuns(
    out.map((run) => (run.style === undefined ? { text: run.text, ...(run.href === undefined ? {} : { href: run.href }) } : run))
  );
};

/**
 * The style shared by every run across a range, and the properties that
 * differ.
 *
 * The properties panel needs both: a value to show, and which controls
 * have to say "mixed" rather than pick one run's answer and lie.
 */
export const styleOfRange = (
  runs: ReadonlyArray<TextRun>,
  start: number,
  end: number
): { shared: TextRunStyle; mixed: string[] } => {
  const covered: TextRun[] = [];
  let seen = 0;
  for (const run of splitAt(splitAt(runs, start), end)) {
    const runEnd = seen + run.text.length;
    if (seen >= start && runEnd <= end && run.text.length > 0) covered.push(run);
    seen = runEnd;
  }
  if (covered.length === 0) return { shared: {}, mixed: [] };

  const props = new Set<string>();
  for (const run of covered) for (const key of Object.keys(run.style ?? {})) props.add(key);

  const shared: Record<string, unknown> = {};
  const mixed: string[] = [];
  for (const prop of props) {
    const values = covered.map(
      (run) => (run.style as Record<string, unknown> | undefined)?.[prop]
    );
    const first = values[0];
    if (values.every((value) => value === first) && first !== undefined) {
      shared[prop] = first;
    } else {
      mixed.push(prop);
    }
  }
  return { shared: shared as TextRunStyle, mixed: mixed.sort() };
};

/**
 * The class a styled run is written with: the element's own class, then
 * `__r` and the run's index.
 *
 * A separate convention from an element's class on purpose. Element
 * classes end in the element's id, and the CSS parser routes a rule to
 * an element by reading that id — so a run needed a shape that cannot
 * be mistaken for one, and that says which element it belongs to.
 */
export const runClassName = (elementClass: string, index: number): string =>
  `${elementClass}__r${index}`;

/** `hero_004e__r1` → `{ elementClass: 'hero_004e', index: 1 }`, or null. */
export const parseRunClassName = (
  className: string
): { elementClass: string; index: number } | null => {
  const match = /^(.+)__r(\d+)$/.exec(className);
  const elementClass = match?.[1];
  const index = match?.[2];
  if (elementClass === undefined || index === undefined) return null;
  return { elementClass, index: Number.parseInt(index, 10) };
};

/** CSS property name for a run-style key. `fontWeight` → `font-weight`. */
const cssProp = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** A run's style as CSS declarations, in a stable order. */
export const runStyleDeclarations = (style: TextRunStyle): string[] => {
  const out: string[] = [];
  // Gradient text is a background CLIPPED to the glyphs, and the clip
  // is what makes it text rather than a coloured box behind the words.
  // Emitted from the image's presence rather than stored, because the
  // two are never meaningful apart. `runInlineStyle` does the same for
  // the canvas. see docs/plans/inline-spans-plan.md
  if (style.backgroundImage !== undefined) {
    out.push('background-clip: text;', '-webkit-background-clip: text;');
  }
  for (const key of Object.keys(style).sort()) {
    if (key === 'customProperties') continue;
    const value = (style as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    out.push(`${cssProp(key)}: ${String(value)};`);
  }
  for (const [prop, value] of Object.entries(style.customProperties ?? {})) {
    out.push(`${prop}: ${value};`);
  }
  return out;
};

/** The inverse: CSS declarations back into a run style. */
export const runStyleFromDeclarations = (
  declarations: ReadonlyArray<{ prop: string; value: string }>
): TextRunStyle => {
  const style: Record<string, unknown> = {};
  const custom: Record<string, string> = {};
  for (const { prop, value } of declarations) {
    switch (prop) {
      case 'color':
        style['color'] = value;
        break;
      case 'background-image':
        style['backgroundImage'] = value;
        break;
      case 'font-weight':
        style['fontWeight'] = Number.parseInt(value, 10);
        break;
      case 'font-style':
        style['fontStyle'] = value;
        break;
      case 'text-decoration-line':
        style['textDecorationLine'] = value;
        break;
      // Derived from the image on the way out, so never stored on the
      // way back in — otherwise it round-trips into customProperties
      // and the run grows a copy of itself on every save.
      case 'background-clip':
      case '-webkit-background-clip':
        break;
      default:
        custom[prop] = value;
    }
  }
  if (Object.keys(custom).length > 0) style['customProperties'] = custom;
  return style as TextRunStyle;
};

/**
 * A run's style as a React inline style object.
 *
 * The canvas styles elements inline rather than through the CSS module —
 * it has no stylesheet of the project's own — so a run needs the same
 * treatment or it renders unstyled on the canvas while looking right in
 * the preview.
 */
export const runInlineStyle = (run: TextRun): Record<string, string | number> => {
  const style = run.style;
  if (style === undefined) return {};
  const out: Record<string, string | number> = {};
  if (style.color !== undefined) out['color'] = style.color;
  if (style.fontWeight !== undefined) out['fontWeight'] = style.fontWeight;
  if (style.fontStyle !== undefined) out['fontStyle'] = style.fontStyle;
  if (style.textDecorationLine !== undefined) {
    out['textDecorationLine'] = style.textDecorationLine;
  }
  if (style.backgroundImage !== undefined) {
    // Gradient text is a background clipped to the glyphs, which only
    // shows when the glyphs themselves are transparent. Emitting the
    // image without the clip paints a coloured box behind the words.
    out['backgroundImage'] = style.backgroundImage;
    out['backgroundClip'] = 'text';
    out['WebkitBackgroundClip'] = 'text';
    if (style.color === undefined) out['color'] = 'transparent';
  }
  for (const [prop, value] of Object.entries(style.customProperties ?? {})) {
    out[prop] = value;
  }
  return out;
};
