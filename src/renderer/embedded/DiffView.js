import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import styles from './DiffView.module.css';
const kindOf = (line) => line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')
    ? 'meta'
    : line.startsWith('@@')
        ? 'hunk'
        : line.startsWith('+')
            ? 'add'
            : line.startsWith('-')
                ? 'del'
                : 'ctx';
/** A unified diff, one line per row, added and removed lines marked. */
export const DiffView = ({ diff }) => (_jsx("pre", { className: styles.diff, "data-testid": "embedded-diff", children: diff.split('\n').map((line, i) => (_jsxs("span", { className: styles.line, "data-kind": kindOf(line), children: [line, '\n'] }, i))) }));
