import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { lintView, severityOf } from '@lib/viewLint';
import { useCanvasStore } from '@store/canvasSlice';
import { Section } from '../sections/Section';
import styles from './ChecksSection.module.css';
/**
 * What the open view got wrong, where the person who has to fix it can
 * see it.
 *
 * `lintView` has existed for a while and had no human-facing surface at
 * all — it was reachable only through the MCP snapshot, so an agent
 * could ask and a person could not. A reviewed project had **6,339
 * undeclared tokens across 60 screens** and nothing anywhere said so;
 * every colour in it resolved to nothing and the screens came out
 * monochrome. The user found out by looking at them.
 *
 * One view's findings, not the project's: these are computed from the
 * canvas store, which holds the open view and nothing else. A
 * project-wide count would mean parsing 60 files on every render.
 * see docs/notes/agent-authored-views-review.md
 */
/** One line per kind, in the order a person should care about them. */
const KIND_ORDER = [
    'marker-leaked',
    'undeclared-token',
    'binding-not-parsed',
    'missing-sample',
    'raw-text-fragment',
    'repeat-rows-differ',
    'table-structure',
    'table-rowspan',
    'table-cell-width',
    'table-repeated-style',
    // Notes, after every problem. see docs/plans/checks-cleanup-plan.md
    'not-panel-editable',
    'side-not-typed',
];
/** A heading for a run of findings of one kind. */
const KIND_LABEL = {
    'marker-leaked': 'Bindings that failed to parse',
    'undeclared-token': 'Tokens this project never declares',
    'binding-not-parsed': 'Bindings Scamp could not read',
    'missing-sample': 'Bound values with no sample',
    'not-panel-editable': 'Values only the CSS panel can edit',
    'side-not-typed': 'One-sided values only the CSS panel can edit',
    'raw-text-fragment': 'Text outside a text element',
    'repeat-rows-differ': 'Repeat rows that are not alike',
    'table-structure': 'Elements in the wrong place in a table',
    'table-rowspan': 'Cells that span rows',
    'table-cell-width': 'Cells with their own width',
    'table-repeated-style': 'Styles repeated on every row or cell',
};
/** How many of each kind to list before saying "and N more". */
const MAX_PER_KIND = 6;
export const ChecksSection = () => {
    const elements = useCanvasStore((s) => s.elements);
    const themeTokens = useCanvasStore((s) => s.themeTokens);
    const componentTrees = useCanvasStore((s) => s.componentTrees);
    const selectElement = useCanvasStore((s) => s.selectElement);
    // Memoised on the identity of what it reads: a lint over a few
    // thousand elements on every keystroke would be felt.
    const findings = useMemo(() => {
        const names = themeTokens.map((token) => token.name);
        try {
            const componentRootTags = Object.fromEntries(Object.entries(componentTrees).map(([name, tree]) => [name, tree.elements[tree.rootId]?.tag]));
            return lintView({ elements, rootId: ROOT_ELEMENT_ID, themeTokens: names, componentRootTags });
        }
        catch {
            // A findings panel must never be the thing that breaks the panel.
            return [];
        }
    }, [elements, themeTokens, componentTrees]);
    const problems = findings.filter((f) => f.severity === 'problem').length;
    if (findings.length === 0)
        return null;
    const byKind = new Map();
    for (const finding of findings) {
        const list = byKind.get(finding.kind);
        if (list === undefined)
            byKind.set(finding.kind, [finding]);
        else
            list.push(finding);
    }
    const kinds = KIND_ORDER.filter((kind) => byKind.has(kind));
    const firstNoteKind = kinds.find((kind) => severityOf(kind) === 'note');
    return (_jsx("div", { "data-testid": "checks-section", children: _jsx(Section, { title: "Checks", collapsible: true, defaultOpen: false, count: problems > 0 ? problems : undefined, children: _jsx("ul", { className: styles.list, children: kinds.map((kind) => {
                    const list = byKind.get(kind) ?? [];
                    return (_jsxs("li", { className: styles.group, children: [kind === firstNoteKind && (_jsxs("div", { className: styles.notesHeading, "data-testid": "checks-notes", children: [_jsx("p", { className: styles.notesTitle, children: "Edit in CSS" }), _jsx("p", { className: styles.hint, children: "These render correctly. The panel has no control for the value, so change it in the CSS panel if you need to." })] })), _jsxs("p", { className: styles.kind, children: [KIND_LABEL[kind], _jsx("span", { className: styles.count, children: list.length })] }), list[0]?.hint !== undefined && (_jsx("p", { className: styles.hint, children: list[0].hint })), _jsx("ul", { className: styles.items, children: list.slice(0, MAX_PER_KIND).map((finding, index) => (_jsx("li", { children: _jsxs("button", { type: "button", className: styles.item, disabled: finding.elementId === null, onClick: () => {
                                            if (finding.elementId !== null)
                                                selectElement(finding.elementId);
                                        }, title: finding.message, children: [_jsx("span", { className: styles.where, children: finding.className ?? 'this view' }), _jsx("span", { className: styles.what, children: finding.message })] }) }, `${finding.elementId ?? 'view'}-${index}`))) }), list.length > MAX_PER_KIND && (_jsxs("p", { className: styles.more, children: ["and ", list.length - MAX_PER_KIND, " more"] }))] }, kind));
                }) }) }) }));
};
