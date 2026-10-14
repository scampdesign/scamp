// @lib/agentMarkdown.ts — the Markdown an agent reply uses, as plain data.
//
// Agent replies use a small part of Markdown: headings, paragraphs, lists,
// bold, italic, inline code, code blocks and rules. This reads exactly that
// into blocks the panel renders as React text nodes — never as HTML — so
// nothing in a reply can inject markup. Anything it doesn't recognise
// (links, tables, raw HTML) stays as the text it was written as.
// see docs/archive/2026-10-06-builtin-agent-plan.md
/**
 * Bold, italic and code within one line of text. Code first — nothing
 * inside backticks is formatting — then `**strong**`, then `*em*` or
 * `_em_` where the markers sit against a word, so `2 * 3` and
 * `snake_case` stay as written.
 */
export const parseInline = (text) => {
    const out = [];
    const pushText = (value) => {
        if (value.length === 0)
            return;
        const last = out.at(-1);
        if (last?.kind === 'text')
            out[out.length - 1] = { kind: 'text', text: last.text + value };
        else
            out.push({ kind: 'text', text: value });
    };
    const pattern = /`([^`\n]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
        const index = match.index ?? 0;
        pushText(text.slice(last, index));
        if (match[1] !== undefined)
            out.push({ kind: 'code', text: match[1] });
        else if (match[2] !== undefined)
            out.push({ kind: 'strong', children: parseInline(match[2]) });
        else
            out.push({ kind: 'em', children: parseInline(match[3] ?? match[4] ?? '') });
        last = index + match[0].length;
    }
    pushText(text.slice(last));
    return out;
};
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
/** A reply, as blocks. Streaming text parses as it arrives. */
export const parseAgentMarkdown = (source) => {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let list = null;
    const flushParagraph = () => {
        if (paragraph.length > 0)
            blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
        paragraph = [];
    };
    const flushList = () => {
        if (list !== null) {
            blocks.push({ kind: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) });
        }
        list = null;
    };
    const flush = () => {
        flushParagraph();
        flushList();
    };
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        const fence = FENCE.exec(line);
        if (fence !== null) {
            flush();
            const marker = fence[1] ?? '```';
            const body = [];
            i += 1;
            // An unclosed fence — a reply still streaming — runs to the end.
            while (i < lines.length && !(lines[i] ?? '').trim().startsWith(marker)) {
                body.push(lines[i] ?? '');
                i += 1;
            }
            blocks.push({ kind: 'code', text: body.join('\n') });
            continue;
        }
        if (line.trim().length === 0) {
            flush();
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading !== null) {
            flush();
            const level = Math.min((heading[1] ?? '#').length, 3);
            blocks.push({ kind: 'heading', level, content: parseInline(heading[2] ?? '') });
            continue;
        }
        if (RULE.test(line)) {
            flush();
            blocks.push({ kind: 'rule' });
            continue;
        }
        const bullet = BULLET.exec(line);
        const numbered = bullet === null ? NUMBERED.exec(line) : null;
        if (bullet !== null || numbered !== null) {
            flushParagraph();
            const ordered = numbered !== null;
            const text = (bullet !== null ? bullet[1] : numbered?.[2]) ?? '';
            if (list === null || list.ordered !== ordered) {
                flushList();
                list = { ordered, start: numbered !== null ? Number(numbered[1]) : 1, items: [] };
            }
            list.items.push(text);
            continue;
        }
        // A wrapped line belongs to the list item above it.
        if (list !== null && /^\s+\S/.test(line)) {
            const items = list.items;
            items[items.length - 1] = `${items[items.length - 1] ?? ''} ${line.trim()}`;
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    flush();
    return blocks;
};
