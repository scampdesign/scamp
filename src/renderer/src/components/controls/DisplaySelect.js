import { jsx as _jsx } from "react/jsx-runtime";
import { EnumSelect } from './EnumSelect';
const BLOCK_OPTIONS = [
    { value: 'block', label: 'Block' },
    { value: 'inline', label: 'Inline' },
    { value: 'inline-block', label: 'Inline block' },
    { value: 'contents', label: 'Contents' },
    { value: 'list-item', label: 'List item' },
];
/** A flex or grid container is block or inline (`inline-flex`, `inline-grid`). */
const CONTAINER_OPTIONS = [
    { value: 'block', label: 'Block' },
    { value: 'inline', label: 'Inline' },
];
/** The outer half of CSS `display`. see `displayKeyword.ts` */
export const DisplaySelect = ({ display, outer, onChange, mixed = false }) => (_jsx(EnumSelect, { mixed: mixed, value: outer ?? 'block', options: display === 'none' ? BLOCK_OPTIONS : CONTAINER_OPTIONS, onChange: (value) => onChange(value === 'block' ? undefined : value), title: "Display \u2014 how the element sits among its neighbors: on its own line (Block), in the line of text (Inline), or with no box of its own (Contents)" }));
