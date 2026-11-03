import { computedToDeclarations } from '@shared/embedded';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from './defaults';
import { ROOT_ELEMENT_ID } from './element';
import { elementDeclarationLines } from './generateCode/declarations';
import { applyDeclarations } from './parseCode/apply';
/**
 * Embedded Scamp drives Scamp's own properties panel from an element of a
 * page it didn't write: the selected node becomes a stand-in `ScampElement`
 * built from its computed styles, and each panel edit is read back as the
 * CSS that changed. see docs/plans/embedded-scamp-plan.md
 */
export const STAND_IN_ID = 'e0e0';
/** A root standing for the parent, and the selected element inside it. */
export const standInTree = (input) => {
    const parentIsLayout = /flex|grid/.test(input.parentDisplay);
    const root = applyDeclarations({ ...DEFAULT_ROOT_STYLES, id: ROOT_ELEMENT_ID, type: 'rectangle', parentId: null, childIds: [STAND_IN_ID], x: 0, y: 0, customProperties: {} }, [{ prop: 'display', value: input.parentDisplay }]);
    const baseline = {
        ...DEFAULT_RECT_STYLES,
        id: STAND_IN_ID,
        type: input.textOnly ? 'text' : 'rectangle',
        tag: input.tag,
        parentId: ROOT_ELEMENT_ID,
        childIds: [],
        x: 0,
        y: 0,
        // In flow unless the page places it: a stand-in with `auto` would read as absolute.
        position: input.computed['position'] === 'static' ? 'static' : DEFAULT_RECT_STYLES.position,
        customProperties: {},
        ...(input.textOnly ? { text: input.text } : {}),
    };
    const element = applyDeclarations(baseline, computedToDeclarations(input.computed), parentIsLayout);
    return { [ROOT_ELEMENT_ID]: root, [STAND_IN_ID]: element };
};
/** `prop: value;` lines as a map; commented-out groups are left out. */
export const declarationMap = (lines) => {
    const out = new Map();
    for (const raw of lines) {
        const line = raw.trim();
        if (line.length === 0 || line.startsWith('/*'))
            continue;
        const at = line.indexOf(':');
        if (at <= 0)
            continue;
        out.set(line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/;$/, '').trim());
    }
    return out;
};
/**
 * What a property is when Scamp's output leaves it out: the generator
 * writes no line for a default, so a value set back to its default reads
 * as removed, and the page needs the default stated to show it.
 */
const CSS_DEFAULT = {
    padding: '0px', margin: '0px', 'border-width': '0px', 'border-style': 'none', 'border-radius': '0px',
    background: 'transparent', 'background-color': 'transparent', 'box-shadow': 'none', opacity: '1',
    transform: 'none', gap: '0px', 'row-gap': '0px', 'column-gap': '0px', width: 'auto', height: 'auto',
    'min-width': 'auto', 'min-height': 'auto', 'max-width': 'none', 'max-height': 'none',
    'flex-direction': 'row', 'justify-content': 'normal', 'align-items': 'normal', 'flex-wrap': 'nowrap',
    'font-weight': '400', 'letter-spacing': 'normal', 'text-align': 'start', 'z-index': 'auto',
    position: 'static', left: 'auto', top: 'auto', overflow: 'visible', filter: 'none',
};
/** The CSS a panel edit changed on the stand-in, as page-ready values. */
export const styleChanges = (before, after) => {
    const was = before[STAND_IN_ID];
    const now = after[STAND_IN_ID];
    if (was === undefined || now === undefined)
        return [];
    const a = declarationMap(elementDeclarationLines(was, before[ROOT_ELEMENT_ID] ?? null));
    const b = declarationMap(elementDeclarationLines(now, after[ROOT_ELEMENT_ID] ?? null));
    const out = [];
    for (const property of new Set([...a.keys(), ...b.keys()])) {
        const from = a.get(property) ?? '';
        const to = b.get(property) ?? CSS_DEFAULT[property] ?? 'initial';
        if (from !== (b.get(property) ?? '') && from !== to)
            out.push({ property, from, to });
    }
    return out;
};
