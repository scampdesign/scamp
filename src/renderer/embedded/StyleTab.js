import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { UiPanel } from '../src/components/UiPanel';
import { useEmbeddedStore } from './embeddedStore';
import { sendInstruction, setPseudo, setScope } from './session';
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
    return (_jsxs("div", { className: styles.tab, "data-testid": "embedded-style-tab", children: [_jsxs("div", { className: styles.head, children: [_jsxs("div", { className: styles.tag, children: ["<", element.tag, ">", element.components[0] !== undefined && _jsxs("span", { className: styles.component, children: [" in ", element.components[0]] })] }), element.source !== null && _jsx("code", { className: styles.source, "data-testid": "embedded-source", children: element.source }), element.source === null && resolving && _jsx("span", { className: styles.source, children: "Finding source\u2026" }), element.source === null && !resolving && (_jsx("p", { className: styles.note, "data-testid": "embedded-source-note", children: element.library !== null
                            ? `Drawn by ${element.library}. Your edits go to the agent, which styles it from your code that uses it.`
                            : 'Scamp couldn’t map this to a line. Your edits still work: the agent finds the element from its classes, text and components.' })), element.instanceCount > 1 && (_jsxs("div", { className: styles.scope, role: "group", "aria-label": "Which instances this edit changes", children: [_jsx("button", { type: "button", "aria-pressed": scope === 'instance', onClick: () => setScope('instance'), children: "This one" }), _jsxs("button", { type: "button", "aria-pressed": scope === 'all', onClick: () => setScope('all'), "data-testid": "embedded-scope-all", children: ["All ", element.instanceCount] })] })), _jsx("div", { className: styles.scope, role: "group", "aria-label": "Which state of the element to show and style", "data-testid": "embedded-states", children: STATES.map(({ state, label }) => (_jsx("button", { type: "button", "aria-pressed": pseudo === state, onClick: () => setPseudo(state), "data-testid": `embedded-state-${state}`, children: label }, state))) }), pseudo !== 'none' && (_jsxs("div", { className: styles.stateNote, children: ["Showing :", pseudo, ". Edits style this state only."] })), pending !== null && pending.changes.length > 0 && (_jsx("div", { className: styles.pending, "data-testid": "embedded-pending", children: pending.changes.map((c) => `${c.property}: ${c.to}`).join(' · ') }))] }), _jsx("div", { "data-testid": "properties-panel", children: _jsx(UiPanel, {}) }), ask] }));
};
