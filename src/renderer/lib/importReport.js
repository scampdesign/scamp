/** Worst first. Ties fall through to how much of the page was touched. */
const SEVERITY = {
    lost: 0,
    'rendered-fallback': 1,
    approximated: 2,
    exact: 3,
};
const DESCRIPTIONS = {
    'pseudo-element': {
        label: (n) => `${n} decorative ::before/::after ${n === 1 ? 'element' : 'elements'} dropped — icons, dividers, counters`,
        fidelity: 'lost',
    },
    'shadow-root': {
        label: (n) => `${n} web ${n === 1 ? 'component' : 'components'} could not be read`,
        fidelity: 'lost',
    },
    canvas: {
        label: (n) => `${n} <canvas> ${n === 1 ? 'element' : 'elements'} — drawn by script, so empty here`,
        fidelity: 'lost',
    },
    iframe: {
        label: (n) => `${n} embedded ${n === 1 ? 'frame' : 'frames'} — the contents are another page`,
        fidelity: 'lost',
    },
    'unsupported-display': {
        label: (n) => `${n} ${n === 1 ? 'element uses' : 'elements use'} a table or display:contents layout, which has no equivalent`,
        fidelity: 'lost',
    },
    'depth-capped': {
        label: (n) => `${n} ${n === 1 ? 'subtree' : 'subtrees'} nested too deeply to read`,
        fidelity: 'lost',
    },
    'node-capped': {
        label: () => 'the page was larger than one import could take',
        fidelity: 'lost',
    },
    svg: {
        label: (n) => `${n} inline ${n === 1 ? 'icon' : 'icons'} kept as markup — they render, but are not editable as shapes`,
        fidelity: 'rendered-fallback',
        editable: 'Size, position and colour are editable; the paths are not.',
    },
    'background-image': {
        label: (n) => `${n} background ${n === 1 ? 'image' : 'images'}`,
        fidelity: 'rendered-fallback',
        editable: 'Editable as a CSS value, not as an image layer.',
    },
    'revealed-on-scroll': {
        label: (n) => `${n} ${n === 1 ? 'element that fades' : 'elements that fade'} in on scroll, captured visible`,
        fidelity: 'approximated',
    },
    'inline-kept': {
        label: (n) => `${n} ${n === 1 ? 'run' : 'runs'} of inline markup kept as text — links and bold inside a sentence are part of it now`,
        fidelity: 'rendered-fallback',
        editable: 'The words are editable as text; the link or bold run inside them is not a layer.',
    },
    'pseudo-materialized': {
        label: (n) => `${n} decorative ${n === 1 ? 'glyph' : 'glyphs'} recovered as text — a ::before or ::after is a real element here, and editable`,
        fidelity: 'exact',
    },
    'grid-tracks-to-fr': {
        label: (n) => `${n} grid ${n === 1 ? 'track list' : 'track lists'} turned back into fractions — the page's own columns were measured in pixels`,
        fidelity: 'approximated',
    },
    'block-to-flex': {
        label: (n) => `${n} block ${n === 1 ? 'container' : 'containers'} became flex columns`,
        fidelity: 'exact',
    },
    'breakpoint-captured': {
        label: (n) => `${n} responsive ${n === 1 ? 'override' : 'overrides'} read from the page's own media queries`,
        fidelity: 'exact',
    },
    'breakpoint-absent': {
        label: (n) => `${n} ${n === 1 ? 'element is' : 'elements are'} missing at a narrower width — Scamp cannot say "hidden below this size"`,
        fidelity: 'lost',
    },
    'restored-auto-margin': {
        label: (n) => `${n} centred ${n === 1 ? 'container' : 'containers'} re-centred with auto margins`,
        fidelity: 'exact',
    },
    'collapsed-wrapper': {
        label: (n) => `${n} empty ${n === 1 ? 'wrapper' : 'wrappers'} removed`,
        fidelity: 'exact',
    },
    'dropped-computed-size': {
        label: (n) => `${n} measured ${n === 1 ? 'size' : 'sizes'} replaced with fill, so the design still reflows`,
        fidelity: 'approximated',
    },
    'wrapped-bare-text': {
        label: (n) => `${n} ${n === 1 ? 'run' : 'runs'} of loose text wrapped in a text element`,
        fidelity: 'exact',
    },
    'marker-leaked': {
        label: (n) => `${n} ${n === 1 ? 'binding' : 'bindings'} failed to parse — this is a bug in Scamp`,
        fidelity: 'lost',
    },
};
/** How many locations to keep per group. Enough to find it, not a dump. */
const MAX_EXAMPLES = 4;
export const buildReport = (findings) => {
    const byKind = new Map();
    for (const finding of findings) {
        const entry = byKind.get(finding.kind) ?? { count: 0, examples: [] };
        // A finding may stand for more than one element; see `ImportFinding`.
        entry.count += finding.count ?? 1;
        const where = finding.at ?? finding.detail;
        if (where !== undefined && entry.examples.length < MAX_EXAMPLES && !entry.examples.includes(where)) {
            entry.examples.push(where);
        }
        byKind.set(finding.kind, entry);
    }
    const groups = [];
    for (const [kind, { count, examples }] of byKind) {
        const describe = DESCRIPTIONS[kind];
        groups.push({
            kind,
            // An unknown kind still gets a readable line rather than being
            // dropped — a finding nobody described is still a finding.
            label: describe ? describe.label(count) : `${count} x ${kind.replace(/-/g, ' ')}`,
            count,
            examples,
            // An undescribed kind is graded `lost` rather than `exact`: a
            // finding nobody has classified is not evidence that it was free.
            fidelity: describe?.fidelity ?? 'lost',
            ...(describe?.editable === undefined ? {} : { editable: describe.editable }),
        });
    }
    // Worst first, then by how much of the page each one touched.
    return groups.sort((a, b) => {
        const bySeverity = SEVERITY[a.fidelity] - SEVERITY[b.fidelity];
        if (bySeverity !== 0)
            return bySeverity;
        return b.count - a.count;
    });
};
