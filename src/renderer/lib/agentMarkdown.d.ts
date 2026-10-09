export type Inline = {
    kind: 'text';
    text: string;
} | {
    kind: 'code';
    text: string;
} | {
    kind: 'strong';
    children: Inline[];
} | {
    kind: 'em';
    children: Inline[];
};
export type Block = {
    kind: 'heading';
    level: 1 | 2 | 3;
    content: Inline[];
} | {
    kind: 'paragraph';
    content: Inline[];
} | {
    kind: 'list';
    ordered: boolean;
    start: number;
    items: Inline[][];
} | {
    kind: 'code';
    text: string;
} | {
    kind: 'rule';
};
/**
 * Bold, italic and code within one line of text. Code first — nothing
 * inside backticks is formatting — then `**strong**`, then `*em*` or
 * `_em_` where the markers sit against a word, so `2 * 3` and
 * `snake_case` stay as written.
 */
export declare const parseInline: (text: string) => Inline[];
/** A reply, as blocks. Streaming text parses as it arrives. */
export declare const parseAgentMarkdown: (source: string) => Block[];
