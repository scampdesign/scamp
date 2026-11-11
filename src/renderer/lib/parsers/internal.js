// parsers/internal.ts — split out of parsers.ts (4.3).
export const tokenizeBorder = (input) => {
    const tokens = [];
    let current = '';
    let depth = 0;
    for (const ch of input) {
        if (ch === '(')
            depth += 1;
        if (ch === ')')
            depth -= 1;
        if (/\s/.test(ch) && depth === 0) {
            if (current.length > 0)
                tokens.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.length > 0)
        tokens.push(current);
    return tokens;
};
// ---- Transitions ---------------------------------------------------
export const NAMED_EASINGS = new Set([
    'ease',
    'linear',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'step-start',
    'step-end',
]);
export const TIME_RE = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)$/i;
export const parseTimeMs = (token) => {
    const m = token.match(TIME_RE);
    if (!m || m[1] === undefined || m[2] === undefined)
        return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n))
        return null;
    return m[2].toLowerCase() === 's' ? Math.round(n * 1000) : Math.round(n);
};
export const isEasingToken = (token) => {
    if (NAMED_EASINGS.has(token.toLowerCase()))
        return true;
    if (/^cubic-bezier\(/i.test(token))
        return true;
    if (/^steps\(/i.test(token))
        return true;
    return false;
};
