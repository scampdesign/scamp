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
/** Does this run paint differently from plain text? */
export const isStyled = (run) => run.href !== undefined ||
    (run.style !== undefined && Object.keys(run.style).length > 0);
/** One unstyled run. The shape every plain text element implies. */
export const runsFromText = (text) => [{ text }];
/** The words, with every run's styling dropped. */
export const textFromRuns = (runs) => runs.map((run) => run.text).join('');
/**
 * The runs view of an element that may not store any.
 *
 * An element with no `runs` is one unstyled run of its `text`, which is
 * every element in every project today.
 */
export const runsOf = (element) => {
    if (element.runs !== undefined && element.runs.length > 0) {
        return element.runs.map((run) => ({ ...run }));
    }
    return runsFromText(element.text ?? '');
};
/** Are two runs identical apart from their words? */
const sameStyle = (a, b) => a.href === b.href && JSON.stringify(a.style ?? {}) === JSON.stringify(b.style ?? {});
/**
 * Join neighbours that paint the same, and drop empties.
 *
 * Without this every edit leaves a seam: styling "AI" and then unstyling
 * it gives three runs that render exactly like one, and the next split
 * happens at a boundary the user cannot see.
 */
export const mergeRuns = (runs) => {
    const out = [];
    for (const run of runs) {
        if (run.text.length === 0)
            continue;
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
export const splitAt = (runs, offset) => {
    if (offset <= 0)
        return runs.map((run) => ({ ...run }));
    const out = [];
    let seen = 0;
    for (const run of runs) {
        const end = seen + run.text.length;
        if (offset > seen && offset < end) {
            const cut = offset - seen;
            out.push({ ...run, text: run.text.slice(0, cut) });
            out.push({ ...run, text: run.text.slice(cut) });
        }
        else {
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
export const applyStyleToRange = (runs, start, end, style) => {
    if (end <= start)
        return mergeRuns(runs);
    const split = splitAt(splitAt(runs, start), end);
    const out = [];
    let seen = 0;
    for (const run of split) {
        const runEnd = seen + run.text.length;
        const covered = seen >= start && runEnd <= end && run.text.length > 0;
        if (!covered) {
            out.push(run);
            seen = runEnd;
            continue;
        }
        const next = { ...(run.style ?? {}) };
        for (const [prop, value] of Object.entries(style)) {
            if (value === null)
                delete next[prop];
            else
                next[prop] = value;
        }
        const styled = Object.keys(next).length > 0;
        out.push({
            ...run,
            ...(styled ? { style: next } : {}),
            ...(styled ? {} : { style: undefined }),
        });
        seen = runEnd;
    }
    return mergeRuns(out.map((run) => (run.style === undefined ? { text: run.text, ...(run.href === undefined ? {} : { href: run.href }) } : run)));
};
/**
 * The style shared by every run across a range, and the properties that
 * differ.
 *
 * The properties panel needs both: a value to show, and which controls
 * have to say "mixed" rather than pick one run's answer and lie.
 */
export const styleOfRange = (runs, start, end) => {
    const covered = [];
    let seen = 0;
    for (const run of splitAt(splitAt(runs, start), end)) {
        const runEnd = seen + run.text.length;
        if (seen >= start && runEnd <= end && run.text.length > 0)
            covered.push(run);
        seen = runEnd;
    }
    if (covered.length === 0)
        return { shared: {}, mixed: [] };
    const props = new Set();
    for (const run of covered)
        for (const key of Object.keys(run.style ?? {}))
            props.add(key);
    const shared = {};
    const mixed = [];
    for (const prop of props) {
        const values = covered.map((run) => run.style?.[prop]);
        const first = values[0];
        if (values.every((value) => value === first) && first !== undefined) {
            shared[prop] = first;
        }
        else {
            mixed.push(prop);
        }
    }
    return { shared: shared, mixed: mixed.sort() };
};
