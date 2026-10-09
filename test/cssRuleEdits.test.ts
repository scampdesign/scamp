import { describe, it, expect } from 'vitest';

import { applyCssChanges, cssRuleChanges, cssSlots } from '@lib/cssRuleEdits';

/**
 * Rule-level changes, and applying them to a stylesheet Scamp did not
 * write. see docs/plans/incremental-writes-plan.md, phase 2
 */

/** Apply a change set the way a save does: base is disk, next is generated. */
const patch = (disk: string, next: string): string =>
  applyCssChanges(disk, cssRuleChanges(disk, next), next);

describe('cssSlots', () => {
  it('addresses top-level rules, rules inside a @media, and other at-rules', () => {
    const slots = cssSlots(
      `.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; }\n}\n@keyframes spin { from { opacity: 0; } }\n`
    );
    expect(slots.map((s) => s.slot)).toEqual([
      { kind: 'rule', selector: '.a' },
      { kind: 'ruleInMedia', media: '(max-width: 768px)', selector: '.a' },
      { kind: 'atRule', key: '@keyframes spin' },
    ]);
  });

  it('treats a state variant as its own rule', () => {
    expect(cssSlots('.a { color: red; }\n.a:hover { color: blue; }\n').map((s) => s.slot)).toEqual([
      { kind: 'rule', selector: '.a' },
      { kind: 'rule', selector: '.a:hover' },
    ]);
  });

  it('returns nothing for an unparseable stylesheet', () => {
    expect(cssSlots('.a { color: red;')).toEqual([]);
  });
});

describe('cssRuleChanges', () => {
  it('finds nothing when the rules agree, whatever the formatting', () => {
    expect(cssRuleChanges('.a { color: red; }\n', '.a {\n  color: red;\n}\n')).toEqual([]);
    expect(cssRuleChanges('.a{color:red}', '.a {\n  color: red;\n}\n')).toEqual([]);
  });

  it('reports only the rule whose declarations differ', () => {
    const changes = cssRuleChanges(
      '.a { color: red; }\n.b { color: green; }\n',
      '.a { color: red; }\n.b { color: blue; }\n'
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ op: 'set', slot: { kind: 'rule', selector: '.b' } });
  });

  it('reports additions and removals', () => {
    const changes = cssRuleChanges('.a { color: red; }\n', '.b { color: blue; }\n');
    expect(changes).toEqual([
      { op: 'set', slot: { kind: 'rule', selector: '.b' }, body: 'color: blue;' },
      { op: 'remove', slot: { kind: 'rule', selector: '.a' } },
    ]);
  });

  it('reaches inside a @media without rewriting the block', () => {
    const base = '@media (max-width: 768px) {\n  .a { color: red; }\n  .b { color: green; }\n}\n';
    const next = '@media (max-width: 768px) {\n  .a { color: red; }\n  .b { color: blue; }\n}\n';
    const changes = cssRuleChanges(base, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.slot).toEqual({
      kind: 'ruleInMedia',
      media: '(max-width: 768px)',
      selector: '.b',
    });
  });

  it('ignores a reordering of declarations that all render the same', () => {
    expect(
      cssRuleChanges(
        '.a { position: absolute; width: 10px; }\n',
        '.a { width: 10px; position: absolute; }\n'
      )
    ).toEqual([]);
  });

  it('still compares strictly when a property repeats, because order decides', () => {
    expect(
      cssRuleChanges(
        '.a { color: red; color: blue; }\n',
        '.a { color: blue; color: red; }\n'
      )
    ).toHaveLength(1);
  });

  it('compares a keyframes block as one unit', () => {
    const changes = cssRuleChanges(
      '@keyframes spin { from { opacity: 0; } }\n',
      '@keyframes spin { from { opacity: 1; } }\n'
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.slot).toEqual({ kind: 'atRule', key: '@keyframes spin' });
  });
});

describe('applyCssChanges', () => {
  it('rewrites one rule and leaves a hand-written file alone otherwise', () => {
    const disk = `/* Written by hand. Keep me. */
.root {
    display: flex;      /* four-space indent, trailing comment */
    gap: 12px;
}

/* A section heading */
.card { color: red }
`;
    const next = '.root {\n  display: flex;\n  gap: 12px;\n}\n\n.card {\n  color: blue;\n}\n';
    const out = patch(disk, next);
    expect(out).toContain('/* Written by hand. Keep me. */');
    expect(out).toContain('/* A section heading */');
    expect(out).toContain('    display: flex;      /* four-space indent, trailing comment */');
    expect(out).toContain('color: blue');
    expect(out).not.toContain('color: red');
  });

  it('keeps the indentation the file already used', () => {
    const disk = '.a {\n    color: red;\n    gap: 4px;\n}\n';
    const out = patch(disk, '.a {\n  color: blue;\n  gap: 4px;\n}\n');
    expect(out).toContain('\n    color: blue;');
    expect(out).toContain('\n    gap: 4px;');
  });

  it('is a no-op when nothing changed', () => {
    const disk = '/* hi */\n.a{color:red}\n';
    expect(patch(disk, '.a {\n  color: red;\n}\n')).toBe(disk);
  });

  it('inserts a new rule next to its neighbour rather than at the end', () => {
    const disk = '.a { color: red; }\n\n.c { color: green; }\n';
    const next = '.a { color: red; }\n\n.b { color: blue; }\n\n.c { color: green; }\n';
    const out = patch(disk, next);
    expect(out.indexOf('.b')).toBeGreaterThan(out.indexOf('.a'));
    expect(out.indexOf('.b')).toBeLessThan(out.indexOf('.c'));
  });

  it('appends a rule that belongs after everything the file has', () => {
    const out = patch('.a { color: red; }\n', '.a { color: red; }\n\n.z { color: blue; }\n');
    expect(out.indexOf('.z')).toBeGreaterThan(out.indexOf('.a'));
  });

  it('removes a rule and drops a breakpoint block left empty', () => {
    const disk = '.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; }\n}\n';
    const out = patch(disk, '.a { color: red; }\n');
    expect(out).toContain('.a');
    expect(out).not.toContain('@media');
  });

  it('adds a breakpoint rule to an existing block, and creates the block when there is none', () => {
    const withBlock = patch(
      '.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; }\n}\n',
      '.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; }\n  .b { color: green; }\n}\n'
    );
    expect(withBlock.match(/@media/g)).toHaveLength(1);
    expect(withBlock).toContain('.b');

    const created = patch(
      '.a { color: red; }\n',
      '.a { color: red; }\n@media (max-width: 390px) {\n  .a { gap: 4px; }\n}\n'
    );
    expect(created).toContain('@media (max-width: 390px)');
    expect(created).toContain('gap: 4px');
  });

  it('keeps an at-rule the generator knows nothing about', () => {
    const disk = '@supports (display: grid) {\n  .a { display: grid; }\n}\n\n.b { color: red; }\n';
    const out = patch(disk, '.b {\n  color: blue;\n}\n');
    expect(out).toContain('@supports (display: grid)');
    expect(out).toContain('color: blue');
  });

  it('refuses to patch a stylesheet it cannot parse', () => {
    expect(() =>
      applyCssChanges('.a { color: red;', [
        { op: 'set', slot: { kind: 'rule', selector: '.a' }, body: 'color: blue;' },
      ], '.a { color: blue; }')
    ).toThrow('could not be parsed');
  });

  it('applies its own output stably: patching twice changes nothing more', () => {
    const disk = '/* keep */\n.a{color:red}\n.b{color:green}\n';
    const next = '.a {\n  color: red;\n}\n\n.b {\n  color: blue;\n}\n';
    const once = patch(disk, next);
    expect(patch(once, next)).toBe(once);
  });
});

describe('rules the incremental writer creates', () => {
  it('indents a new rule the way the generator writes it', () => {
    const out = patch('.a {\n  color: red;\n}\n', '.a {\n  color: red;\n}\n\n.b {\n  color: blue;\n  gap: 4px;\n}\n');
    expect(out).toContain('.b {\n  color: blue;\n  gap: 4px;\n}');
  });

  it('indents a new rule inside a breakpoint block one level deeper', () => {
    const out = patch(
      '.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; }\n}\n',
      '.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; }\n  .b { color: green; }\n}\n'
    );
    expect(out).toContain('  .b {\n    color: green;\n  }');
  });

  it('closes a breakpoint block it creates on a line of its own', () => {
    // A Tablet edit on a page with no Tablet rules yet. Written as `  }}`
    // since the indented insert, which broke the breakpoint specs' reading.
    const out = patch(
      '.a {\n  padding: 24px;\n}\n',
      '.a {\n  padding: 24px;\n}\n@media (max-width: 768px) {\n  .a {\n    padding: 12px;\n  }\n}\n'
    );
    expect(out).toContain('@media (max-width: 768px) {\n  .a {\n    padding: 12px;\n  }\n}');
  });
});

describe("a table's derived rules", () => {
  const STRIPE =
    ':where(.t1) > :where(tbody) > :where(tr:nth-child(even)),\n' +
    ':where(.t1) > :where(tr:nth-child(even of tr)) {\n  background-color: #eee;\n}';

  it('are removed when the model stops emitting them', () => {
    // Left on disk, a stripe switched off in the panel would be read
    // straight back in by the next parse.
    const out = patch(`.t1 {\n  display: grid;\n}\n\n${STRIPE}\n`, '.t1 {\n  display: grid;\n}\n');
    expect(out).not.toContain('nth-child');
  });

  it('remove the subgrid rule when a table stops being a grid', () => {
    const disk =
      '.t1 {\n  display: grid;\n}\n\n' +
      ':where(.t1) > :where(thead, tbody, tfoot),\n:where(.t1) :where(tr) {\n  display: grid;\n}\n';
    expect(patch(disk, '.t1 {}\n')).not.toContain('subgrid');
    expect(patch(disk, '.t1 {}\n')).not.toContain(':where(tr)');
  });

  it('leave a hand-written :where rule alone', () => {
    const disk = '.card {\n  color: red;\n}\n\n:where(.card) p {\n  margin: 0;\n}\n';
    expect(patch(disk, '.card {\n  color: blue;\n}\n')).toContain(':where(.card) p');
  });
});

describe("a table's caption rule", () => {
  it('is removed when the model stops emitting it', () => {
    const disk = '.t1 {\n  display: grid;\n}\n\n:where(.t1) > :where(caption) {\n  grid-column: 1 / -1;\n}\n';
    expect(patch(disk, '.t1 {}\n')).not.toContain('caption');
  });
});
