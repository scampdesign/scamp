/**
 * Just enough of source maps to turn a dev server's chunk position into a
 * project file and line, for Next.js, where Scamp doesn't tag elements at
 * build time. Pure. see docs/plans/embedded-scamp-plan.md
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));
/** Decode a `mappings` string; `null` for malformed input. */
export const decodeMappings = (mappings) => {
    const lines = [];
    let source = 0;
    let srcLine = 0;
    let srcCol = 0;
    for (const line of mappings.split(';')) {
        const segments = [];
        let genCol = 0;
        for (const seg of line.split(',')) {
            if (seg.length === 0)
                continue;
            const values = [];
            let value = 0;
            let shift = 0;
            for (const ch of seg) {
                const digit = B64_INDEX.get(ch);
                if (digit === undefined)
                    return null;
                value += (digit & 31) << shift;
                if (digit & 32) {
                    shift += 5;
                }
                else {
                    values.push(value & 1 ? -(value >>> 1) : value >>> 1);
                    value = 0;
                    shift = 0;
                }
            }
            genCol += values[0] ?? 0;
            if (values.length >= 4) {
                source += values[1] ?? 0;
                srcLine += values[2] ?? 0;
                srcCol += values[3] ?? 0;
                segments.push([genCol, source, srcLine, srcCol]);
            }
        }
        lines.push(segments);
    }
    return lines;
};
/**
 * Where a 1-based line and column of the generated file came from, with a
 * 1-based line and 0-based column in the original. Stack traces give
 * 1-based columns: pass them as they are.
 */
export const originalPosition = (map, line, column) => {
    if (map.sections !== undefined) {
        const at = (s) => s.offset.line < line - 1 || (s.offset.line === line - 1 && s.offset.column <= column - 1);
        const section = [...map.sections].reverse().find(at);
        if (section === undefined)
            return null;
        const dl = line - 1 - section.offset.line;
        return originalPosition(section.map, dl + 1, dl === 0 ? column - section.offset.column : column);
    }
    const decoded = decodeMappings(map.mappings ?? '');
    const segments = decoded?.[line - 1];
    if (segments === undefined || segments.length === 0)
        return null;
    let best = null;
    for (const seg of segments) {
        if (seg[0] <= column - 1)
            best = seg;
        else
            break;
    }
    best ??= segments[0] ?? null;
    if (best === null)
        return null;
    const source = map.sources?.[best[1]];
    if (source === undefined)
        return null;
    const root = map.sourceRoot ?? '';
    return { source: root.length > 0 && !/^[a-z]+:/i.test(source) ? `${root.replace(/\/$/, '')}/${source}` : source, line: best[2] + 1, column: best[3] };
};
/** The last `sourceMappingURL` comment in a chunk, or null. */
export const sourceMappingUrl = (code) => {
    const all = [...code.matchAll(/[#@]\s*sourceMappingURL=(\S+)/g)];
    return all[all.length - 1]?.[1] ?? null;
};
/** A `data:` source map URL's map; null when it isn't one or doesn't parse. */
export const inlineMap = (url) => {
    const m = /^data:application\/json;(?:charset=[^;,]+;)?base64,(.+)$/.exec(url);
    if (m === null)
        return null;
    try {
        return JSON.parse(Buffer.from(m[1] ?? '', 'base64').toString('utf8'));
    }
    catch {
        return null;
    }
};
/**
 * A source map's `source` as a path inside the project, or null when it
 * points elsewhere. Handles webpack's, Turbopack's and plain file URLs.
 */
export const projectPath = (source, root) => {
    let s = decodeURIComponent(source.replace(/\?.*$/, ''));
    s = s
        .replace(/^webpack:\/\/(?:_N_E|[^/]*)\//, '')
        .replace(/^turbopack:\/\/\/?/, '')
        .replace(/^\[project\]\//, '')
        .replace(/^file:\/\//, '')
        .replace(/^\(app-pages-browser\)\//, '')
        .replace(/^\.\//, '');
    const base = root.replace(/\\/g, '/').replace(/\/$/, '');
    s = s.replace(/\\/g, '/');
    if (s.startsWith(`${base}/`))
        s = s.slice(base.length + 1);
    else if (s.startsWith('/') || /^[A-Za-z]:\//.test(s))
        return null;
    if (s.startsWith('../') || s.length === 0)
        return null;
    return s;
};
/**
 * The local names of an element's classes, as its source writes them:
 * CSS Module names come out hashed, differently per bundler.
 */
export const classTokens = (classes) => {
    const out = new Set();
    for (const c of classes) {
        const turbopack = /^.+-module__[\w-]+__(.+)$/.exec(c);
        const webpack = /^[A-Za-z0-9-]+_(.+?)__[\w-]{5,}$/.exec(c);
        const vite = /^_(.+)_[a-z0-9]{5}_\d+$/.exec(c);
        out.add(turbopack?.[1] ?? webpack?.[1] ?? vite?.[1] ?? c);
    }
    return [...out];
};
/**
 * The line of JSX that most likely draws the element, near `line`
 * (1-based): a line opening `<tag`, scored up for the element's class
 * names and text. `line` itself wins a tie. Null when no line opens `<tag`.
 */
export const refineLine = (code, line, hints, radius = 40) => {
    const lines = code.split('\n');
    const open = new RegExp(`<${hints.tag.replace(/[^\w-]/g, '')}(?=[\\s/>])`);
    const tokens = classTokens(hints.classes).filter((t) => t.length > 1 && !/[:[\]]/.test(t));
    const words = hints.text.replace(/…$/, '').slice(0, 24).trim();
    let best = null;
    const from = Math.max(1, line - radius);
    const to = Math.min(lines.length, line + radius);
    for (let n = from; n <= to; n += 1) {
        const text = lines[n - 1] ?? '';
        const m = open.exec(text);
        if (m === null)
            continue;
        // The tag's attributes may run over a few lines; its text starts on this one or the next.
        const attrs = lines.slice(n - 1, n + 2).join('\n');
        const content = lines.slice(n - 1, n + 1).join('\n');
        let score = 10 - Math.abs(n - line) / (radius + 1);
        for (const t of tokens)
            if (attrs.includes(t))
                score += 4;
        if (words.length > 2 && content.includes(words))
            score += 3;
        if (best === null || score > best.score)
            best = { line: n, column: m.index, score };
    }
    return best === null ? null : { line: best.line, column: best.column };
};
