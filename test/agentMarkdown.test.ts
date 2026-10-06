import { describe, it, expect } from 'vitest';

import { parseAgentMarkdown, parseInline } from '@lib/agentMarkdown';

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('Use **flex** with *gap* in `card_a1b2`.')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'flex' }] },
      { kind: 'text', text: ' with ' },
      { kind: 'em', children: [{ kind: 'text', text: 'gap' }] },
      { kind: 'text', text: ' in ' },
      { kind: 'code', text: 'card_a1b2' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps formatting characters inside code as written', () => {
    expect(parseInline('`**not bold**`')).toEqual([{ kind: 'code', text: '**not bold**' }]);
  });

  it('reads code inside bold', () => {
    expect(parseInline('**Margin:** `0 auto`')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Margin:' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: '0 auto' },
    ]);
  });

  it('leaves arithmetic, snake_case and stray markers alone', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }]);
    expect(parseInline('a snake_case_name here')).toEqual([{ kind: 'text', text: 'a snake_case_name here' }]);
    expect(parseInline('an unclosed **bold')).toEqual([{ kind: 'text', text: 'an unclosed **bold' }]);
  });

  it('keeps markup as text, never as HTML', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseAgentMarkdown', () => {
  // From a real agent reply: a review of an agent-built project.
  const REVIEW = [
    '# Scamp convention review',
    '',
    'I ran Scamp’s own check on 15 of the 59 views and looked at the',
    'project’s structure.',
    '',
    '## 1. Critical: almost every colour token is missing',
    '**This is almost certainly why the pages don’t render correctly.**',
    '',
    'design/theme.css declares only 10 tokens. That means:',
    '- **Backgrounds** are transparent.',
    '- **Borders** don’t draw.',
    '',
    '## Suggested fix order',
    '1. **Add the missing tokens** to design/theme.css.',
    '2. **Remove the legacy app/ pages** once you’ve confirmed',
    '   nothing uses them.',
    '3. **Turn the repeated UI into components.**',
  ].join('\n');

  it('reads a real reply into headings, paragraphs and lists', () => {
    const blocks = parseAgentMarkdown(REVIEW);
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'paragraph',
      'list',
      'heading',
      'list',
    ]);
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      content: [{ kind: 'text', text: 'Scamp convention review' }],
    });
    // Soft-wrapped lines join into one paragraph.
    expect(blocks[1]).toEqual({
      kind: 'paragraph',
      content: [
        { kind: 'text', text: 'I ran Scamp’s own check on 15 of the 59 views and looked at the project’s structure.' },
      ],
    });
  });

  it('reads a numbered list, its start, and an item that wraps', () => {
    const list = parseAgentMarkdown(REVIEW).at(-1);
    expect(list).toMatchObject({ kind: 'list', ordered: true, start: 1 });
    if (list?.kind !== 'list') return;
    expect(list.items).toHaveLength(3);
    expect(list.items[1]).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Remove the legacy app/ pages' }] },
      { kind: 'text', text: ' once you’ve confirmed nothing uses them.' },
    ]);
  });

  it('keeps a numbered list that starts later', () => {
    expect(parseAgentMarkdown('3. third\n4. fourth')[0]).toMatchObject({ kind: 'list', start: 3 });
  });

  it('starts a new list when bullets turn into numbers', () => {
    expect(parseAgentMarkdown('- a\n- b\n1. one').map((b) => b.kind)).toEqual(['list', 'list']);
  });

  it('caps headings at level 3 — the panel has no room for more', () => {
    expect(parseAgentMarkdown('#### Deep')[0]).toMatchObject({ kind: 'heading', level: 3 });
  });

  it('reads a fenced code block verbatim, formatting characters and all', () => {
    expect(parseAgentMarkdown('Before\n```css\n.a { color: red; }\n**x**\n```\nAfter')).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Before' }] },
      { kind: 'code', text: '.a { color: red; }\n**x**' },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'After' }] },
    ]);
  });

  it('runs an unclosed fence to the end, as a reply still streaming has one', () => {
    expect(parseAgentMarkdown('```\nhalf written')).toEqual([{ kind: 'code', text: 'half written' }]);
  });

  it('reads a horizontal rule', () => {
    expect(parseAgentMarkdown('above\n\n---\n\nbelow').map((b) => b.kind)).toEqual(['paragraph', 'rule', 'paragraph']);
  });

  it('treats Windows line endings the same', () => {
    expect(parseAgentMarkdown('# A\r\n\r\ntext')).toEqual(parseAgentMarkdown('# A\n\ntext'));
  });

  it('returns nothing for an empty reply', () => {
    expect(parseAgentMarkdown('')).toEqual([]);
    expect(parseAgentMarkdown('\n\n  \n')).toEqual([]);
  });
});
