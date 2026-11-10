import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { IconArrowBarUp, IconBoxMargin, IconCopy, IconTrash } from '@tabler/icons-react';
import { scopeWords } from '@shared/embedded';
import { Tooltip } from '../src/components/controls/Tooltip';
import { UiPanel } from '../src/components/UiPanel';
import { CodeSection } from './CodeSection';
import { ContentSection } from './ContentSection';
import { IconButton } from './IconButton';
import { useEmbeddedStore } from './embeddedStore';
import { selectParent, sendInstruction, setPseudo, setScope, structureEdit } from './session';
import styles from './StyleTab.module.css';
const STATES = [
    { state: 'none', label: 'Default' },
    { state: 'hover', label: 'Hover' },
    { state: 'focus', label: 'Focus' },
    { state: 'active', label: 'Active' },
];
/** The selected element: where it's written, how far an edit reaches, and Scamp's panel. */
export const StyleTab = () => {
    const selection = useEmbeddedStore((s) => s.selection);
    const scope = useEmbeddedStore((s) => s.scope);
    const edit = useEmbeddedStore((s) => s.edit);
    const pending = useEmbeddedStore((s) => s.pending);
    const pseudo = useEmbeddedStore((s) => s.pseudo);
    const resolving = useEmbeddedStore((s) => s.resolving);
    const dragNote = useEmbeddedStore((s) => s.dragNote);
    const [instruction, setInstruction] = useState('');
    const handleSend = async () => {
        await sendInstruction(instruction);
        setInstruction('');
    };
    const ask = (_jsxs("form", { className: styles.ask, onSubmit: (e) => {
            e.preventDefault();
            void handleSend();
        }, children: [_jsx("textarea", { className: styles.askInput, value: instruction, onChange: (e) => setInstruction(e.target.value), placeholder: selection !== null ? 'Tell the agent how to change this, such as “match the primary button”' : 'Tell the agent what to change on this page', rows: 3, "data-testid": "embedded-instruction" }), _jsx("button", { type: "submit", className: styles.askButton, disabled: instruction.trim().length === 0, children: "Ask the agent" })] }));
    if (selection === null) {
        return (_jsxs("div", { className: styles.tab, children: [_jsx("p", { className: styles.hint, children: edit ? 'Click an element in your app to style it.' : 'Turn on Edit, then click an element in your app to style it.' }), ask] }));
    }
    const { element } = selection;
    const words = scopeWords(element);
    return (_jsxs("div", { className: styles.tab, "data-testid": "embedded-style-tab", children: [_jsxs("div", { className: styles.head, children: [_jsxs("div", { className: styles.titleRow, children: [_jsxs("div", { className: styles.tag, children: ["<", element.tag, ">", element.components[0] !== undefined && _jsxs("span", { className: styles.component, children: [" in ", element.components[0]] })] }), _jsxs("div", { className: styles.actions, children: [_jsx(IconButton, { icon: IconArrowBarUp, variant: "bare", label: "Select parent", tooltip: "Select parent \u2014 Select the element this one is inside, to style or move it", onClick: selectParent, testId: "embedded-select-parent" }), _jsx(IconButton, { icon: IconCopy, variant: "bare", label: "Duplicate", tooltip: "Duplicate \u2014 Cmd+D", onClick: () => void structureEdit('duplicate'), testId: "embedded-duplicate" }), _jsx(IconButton, { icon: IconBoxMargin, variant: "bare", label: "Wrap in a container", onClick: () => void structureEdit('wrap'), testId: "embedded-wrap" }), _jsx(IconButton, { icon: IconTrash, variant: "bare", label: "Delete", tooltip: "Delete \u2014 Delete key", onClick: () => void structureEdit('delete'), testId: "embedded-delete" })] })] }), element.source !== null && _jsx("code", { className: styles.source, "data-testid": "embedded-source", children: element.source }), element.source === null && resolving && _jsx("span", { className: styles.source, children: "Finding source\u2026" }), element.source === null && !resolving && (_jsx("p", { className: styles.note, "data-testid": "embedded-source-note", children: element.library !== null
                            ? `Drawn by ${element.library}. Your edits go to the agent, which styles it from your code that uses it.`
                            : 'Scamp couldn’t map this to a line. Your edits still work: the agent finds the element from its classes, text and components.' })), element.instanceCount > 1 && (_jsxs("div", { className: styles.scope, role: "group", "aria-label": "Which instances this edit changes", children: [_jsx(Tooltip, { label: words.oneTip, children: _jsx("button", { type: "button", "aria-pressed": scope === 'instance', onClick: () => setScope('instance'), "data-testid": "embedded-scope-one", children: words.one }) }), _jsx(Tooltip, { label: words.everyTip, children: _jsx("button", { type: "button", "aria-pressed": scope === 'all', onClick: () => setScope('all'), "data-testid": "embedded-scope-all", children: words.every }) })] })), _jsx("div", { className: styles.scope, role: "group", "aria-label": "Which state of the element to show and style", "data-testid": "embedded-states", children: STATES.map(({ state, label }) => (_jsx("button", { type: "button", "aria-pressed": pseudo === state, onClick: () => setPseudo(state), "data-testid": `embedded-state-${state}`, children: label }, state))) }), selection.also.length > 0 && (_jsxs("div", { className: styles.stateNote, "data-testid": "embedded-also", children: [selection.also.length + 1, " elements selected. Edits reach all of them; the panel shows the first."] })), pseudo !== 'none' && (_jsxs("div", { className: styles.stateNote, children: ["Showing :", pseudo, ". Edits style this state only."] })), dragNote !== null && (_jsx("p", { className: styles.note, role: "status", "data-testid": "embedded-drag-note", children: dragNote })), pending !== null && pending.changes.length > 0 && (_jsx("div", { className: styles.pending, "data-testid": "embedded-pending", children: pending.changes.map((c) => `${c.property}: ${c.to}`).join(' · ') }))] }), _jsx(ContentSection, {}), _jsx("div", { "data-testid": "properties-panel", children: _jsx(UiPanel, {}) }), _jsx(CodeSection, {}), ask] }));
};
