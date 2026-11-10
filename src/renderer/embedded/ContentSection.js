import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useEmbeddedStore } from "./embeddedStore";
import { chooseImage, commitContent, contentFields, notEditableReason, } from "./session";
import styles from "./ContentSection.module.css";
const LABEL = {
    text: "Text",
    src: "Image",
    alt: "Alt text",
    href: "Link",
};
/** Where the content comes from, in a few words; null while Scamp looks. */
const originNote = (origin) => {
    if (origin === undefined)
        return "Checking where this comes from…";
    if (origin.kind === "literal")
        return `Written at ${origin.at}`;
    if (origin.kind === "import")
        return `Imported from ${origin.value}, at ${origin.at}`;
    if (origin.kind === "prop")
        return `Set where ${origin.component} is used, at ${origin.at}`;
    return notEditableReason(origin) ?? "";
};
const Field = ({ field, value, origin, uid }) => {
    const [draft, setDraft] = useState(value);
    // A new selection, or the page's value changing (an undo), resets the field.
    useEffect(() => setDraft(value), [value, uid]);
    const locked = origin === undefined || notEditableReason(origin) !== null;
    const commit = () => {
        if (draft !== value)
            void commitContent(field, draft);
    };
    return (_jsxs("div", { className: styles.field, "data-field": field, children: [_jsxs("label", { className: styles.label, children: [_jsx("span", { children: LABEL[field] }), _jsxs("span", { className: styles.row, children: [_jsx("input", { className: styles.input, value: draft, disabled: locked, onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: (e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        commit();
                                    }
                                    else if (e.key === "Escape")
                                        setDraft(value);
                                }, placeholder: field === "alt" ? "Describe the image" : undefined, "data-testid": `embedded-content-${field}` }), field === "src" && (_jsx("button", { type: "button", className: styles.pick, disabled: locked, onClick: () => void chooseImage(), "data-testid": "embedded-content-choose-image", children: "Choose file\u2026" }))] })] }), _jsx("p", { className: styles.note, "data-locked": origin !== undefined && locked, "data-testid": `embedded-content-${field}-note`, children: originNote(origin) })] }));
};
/**
 * The selection's text, image, and link, in the Style tab. Only content
 * written in the code is editable; content from data says why it isn't.
 * see docs/plans/embedded-canvas-gaps.md (P5)
 */
export const ContentSection = () => {
    const selection = useEmbeddedStore((s) => s.selection);
    if (selection === null)
        return null;
    const fields = contentFields(selection);
    if (fields.length === 0)
        return null;
    return (_jsxs("section", { className: styles.section, "data-testid": "embedded-content", children: [_jsx("h3", { className: styles.title, children: "Content" }), fields.map((field) => (_jsx(Field, { field: field, value: selection.content[field] ?? "", origin: selection.origins[field], uid: selection.uid }, field))), fields.includes("text") &&
                notEditableReason(selection.origins.text) === null && (_jsx("p", { className: styles.hint, children: "You can also double-click the text on the page to edit it there." }))] }));
};
