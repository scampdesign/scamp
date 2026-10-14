import { describe, expect, it } from 'vitest';

import { buildContextMarkdown, type ContextInput } from '@lib/contextMarkdown';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';

/**
 * The live context file. Everything an agent reads about the canvas comes
 * through here, so the unhappy paths (nothing selected, a stale selection,
 * a corrupt parent link) matter as much as the happy one.
 * see docs/archive/2026-08-05-live-context-file-plan.md
 */

const el = (overrides: Partial<ScampElement> & { id: string }): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  ...overrides,
});

const pageTarget = {
  kind: 'page' as const,
  name: 'dashboard',
  tsxPath: 'app/dashboard/page.tsx',
  cssPath: 'app/dashboard/page.module.css',
};

const build = (over: Partial<ContextInput> = {}): string =>
  buildContextMarkdown({
    target: pageTarget,
    elements: {},
    selectedIds: [],
    canvasWidth: 1440,
    breakpointLabel: 'desktop',
    ...over,
  });

/** A root + a flex card holding a text child. */
const tree = (): Record<string, ScampElement> => ({
  [ROOT_ELEMENT_ID]: el({
    id: ROOT_ELEMENT_ID,
    parentId: null,
    childIds: ['body'],
  }),
  body: el({ id: 'body', childIds: ['a1b2'], display: 'flex' }),
  a1b2: el({
    id: 'a1b2',
    parentId: 'body',
    childIds: ['c3d4', 'e5f6'],
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    padding: [24, 24, 24, 24],
    backgroundColor: '#f0f0f0',
    widthMode: 'fixed',
    widthValue: 400,
  }),
  c3d4: el({ id: 'c3d4', parentId: 'a1b2', childIds: ['deep1', 'deep2'] }),
  e5f6: el({
    id: 'e5f6',
    parentId: 'a1b2',
    type: 'text',
    text: 'Hello world',
  }),
  deep1: el({ id: 'deep1', parentId: 'c3d4' }),
  deep2: el({ id: 'deep2', parentId: 'c3d4' }),
});

describe('buildContextMarkdown — framing', () => {
  it('opens with the do-not-edit banner', () => {
    const out = build();
    expect(out).toContain('# Scamp Active Context');
    expect(out).toContain('This file is updated automatically by Scamp. Do not edit.');
  });

  it('names the open page and both its files', () => {
    const out = build();
    expect(out).toContain('## Active page');
    expect(out).toContain('Page: dashboard');
    expect(out).toContain('File: app/dashboard/page.tsx');
    expect(out).toContain('CSS:  app/dashboard/page.module.css');
  });

  it('says "Active component" when the component editor is open', () => {
    const out = build({
      target: {
        kind: 'component',
        name: 'Button',
        tsxPath: 'components/Button/Button.tsx',
        cssPath: 'components/Button/Button.module.css',
      },
    });
    expect(out).toContain('## Active component');
    expect(out).toContain('Component: Button');
  });

  it('reports the canvas size and active breakpoint', () => {
    expect(build({ canvasWidth: 390, breakpointLabel: 'mobile' })).toContain(
      '390px wide / mobile breakpoint'
    );
  });

  it('ends with a trailing newline', () => {
    expect(build().endsWith('\n')).toBe(true);
  });
});

describe('buildContextMarkdown — no selection', () => {
  it('says so explicitly rather than omitting the section', () => {
    const out = build({ elements: tree() });
    expect(out).toContain('## Selected element\n\nNone selected.');
  });

  it('omits the per-element sections entirely', () => {
    const out = build({ elements: tree() });
    expect(out).not.toContain('## Current styles');
    expect(out).not.toContain('## Children');
  });

  it('still reports the page, so the agent knows where it is', () => {
    expect(build({ elements: tree() })).toContain('File: app/dashboard/page.tsx');
  });

  it('treats a selection that no longer exists as no selection', () => {
    // The tree can be replaced under a stale id by an external edit.
    const out = build({ elements: tree(), selectedIds: ['gone'] });
    expect(out).toContain('None selected.');
  });
});

describe('buildContextMarkdown — selected element', () => {
  const out = (): string => build({ elements: tree(), selectedIds: ['a1b2'] });

  it('reports id, class and tag', () => {
    expect(out()).toContain('ID:      a1b2');
    expect(out()).toContain('Class:   .rect_a1b2');
    expect(out()).toContain('Tag:     div');
  });

  it('names the direct parent', () => {
    expect(out()).toContain('Parent:  .rect_body');
  });

  it('lists the ancestor chain outermost first', () => {
    // A flex ancestor is usually the answer to "why does this look wrong".
    expect(out()).toContain('Chain:   .root › .rect_body');
  });

  it('includes a user-defined name only when one is set', () => {
    expect(out()).not.toContain('Name:');
    const named = build({
      elements: { ...tree(), a1b2: { ...tree()['a1b2']!, name: 'sidebar' } },
      selectedIds: ['a1b2'],
    });
    expect(named).toContain('Name:    sidebar');
    // A named element also gets a name-derived class.
    expect(named).toContain('Class:   .sidebar_a1b2');
  });

  it('omits the parent and chain lines for the root', () => {
    const rootSelected = build({ elements: tree(), selectedIds: [ROOT_ELEMENT_ID] });
    expect(rootSelected).not.toContain('Parent:');
    expect(rootSelected).not.toContain('Chain:');
  });
});

describe('buildContextMarkdown — current styles', () => {
  it('renders the same declarations the CSS file gets', () => {
    const out = build({ elements: tree(), selectedIds: ['a1b2'] });
    expect(out).toContain('display: flex;');
    expect(out).toContain('gap: 16px;');
    expect(out).toContain('padding: 24px;');
    expect(out).toContain('background: #f0f0f0;');
    expect(out).toContain('width: 400px;');
  });

  it('says so when every declaration is a custom property', () => {
    // The only way the block empties out: a non-flex child always gets
    // `position: absolute` from the generator, so a genuinely bare element
    // still has styles. What CAN empty it is filtering the custom ones out.
    const onlyCustom = {
      [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['x1y2'] }),
      x1y2: el({
        id: 'x1y2',
        widthMode: 'auto',
        heightMode: 'auto',
        customProperties: { position: 'absolute', left: '0px', top: '0px' },
      }),
    };
    const out = build({ elements: onlyCustom, selectedIds: ['x1y2'] });
    expect(out).toContain("Nothing set through Scamp's canvas controls.");
    expect(out).toContain('## Custom properties');
  });

  it('keeps custom properties out of the styles block', () => {
    // They get their own section; listing them twice would imply the agent
    // could set them through a canvas control.
    const withCustom = {
      ...tree(),
      a1b2: {
        ...tree()['a1b2']!,
        customProperties: { 'box-shadow': '0 2px 8px rgba(0,0,0,0.1)' },
      },
    };
    const out = build({ elements: withCustom, selectedIds: ['a1b2'] });
    const styles = out.slice(
      out.indexOf('## Current styles'),
      out.indexOf('## Children')
    );
    expect(styles).not.toContain('box-shadow');
    expect(out).toContain('## Custom properties (not mapped to canvas controls)');
    expect(out).toContain('box-shadow: 0 2px 8px rgba(0,0,0,0.1);');
  });

  it('omits the custom-properties section when there are none', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).not.toContain(
      '## Custom properties'
    );
  });
});

describe('buildContextMarkdown — children', () => {
  it('summarises a container child by its child count', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).toContain(
      '- .rect_c3d4 (div) — 2 children'
    );
  });

  it('previews a text child rather than counting it', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).toContain(
      '- .text_e5f6 (p) — "Hello world"'
    );
  });

  it('uses the singular for exactly one child', () => {
    // root's only child is `body`, which itself holds exactly one element.
    expect(build({ elements: tree(), selectedIds: [ROOT_ELEMENT_ID] })).toContain(
      '— 1 child'
    );
  });

  it('lists a childless element with no summary suffix', () => {
    expect(build({ elements: tree(), selectedIds: ['c3d4'] })).toContain(
      '- .rect_deep1 (div)\n'
    );
  });

  it('names the component behind an instance child', () => {
    const withInstance = {
      ...tree(),
      c3d4: {
        ...tree()['c3d4']!,
        type: 'component-instance' as const,
        componentName: 'Button',
        childIds: [],
      },
    };
    expect(build({ elements: withInstance, selectedIds: ['a1b2'] })).toContain(
      'instance of Button'
    );
  });

  it('truncates a long text preview to one line', () => {
    const long = 'x'.repeat(120);
    const withLong = {
      ...tree(),
      e5f6: { ...tree()['e5f6']!, text: long },
    };
    const out = build({ elements: withLong, selectedIds: ['a1b2'] });
    expect(out).toContain('…"');
    expect(out).not.toContain(long);
  });

  it('flattens newlines in a preview so one child is one line', () => {
    const withNewlines = {
      ...tree(),
      e5f6: { ...tree()['e5f6']!, text: 'first\nsecond' },
    };
    expect(build({ elements: withNewlines, selectedIds: ['a1b2'] })).toContain(
      '"first second"'
    );
  });

  it('omits the section for an element with no children', () => {
    expect(build({ elements: tree(), selectedIds: ['e5f6'] })).not.toContain(
      '## Children'
    );
  });
});

describe('buildContextMarkdown — multi-select', () => {
  it('details the primary and counts the rest', () => {
    const out = build({ elements: tree(), selectedIds: ['a1b2', 'c3d4', 'e5f6'] });
    expect(out).toContain('ID:      a1b2');
    expect(out).toContain('+2 more elements also selected');
  });

  it('uses the singular for exactly one extra', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2', 'c3d4'] })).toContain(
      '+1 more element also selected'
    );
  });

  it('says nothing about extras for a single selection', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).not.toContain(
      'also selected'
    );
  });
});

describe('buildContextMarkdown — degenerate input', () => {
  it('handles no project being open', () => {
    expect(build({ target: null })).toContain('No project open.');
  });

  it('terminates on a cyclic parent link instead of hanging', () => {
    // Defensive: a corrupt tree must not wedge the write path.
    const cyclic: Record<string, ScampElement> = {
      a: el({ id: 'a', parentId: 'b' }),
      b: el({ id: 'b', parentId: 'a' }),
    };
    const out = build({ elements: cyclic, selectedIds: ['a'] });
    expect(out).toContain('ID:      a');
  });

  it('survives a child id that points at nothing', () => {
    const dangling = {
      ...tree(),
      a1b2: { ...tree()['a1b2']!, childIds: ['c3d4', 'missing'] },
    };
    const out = build({ elements: dangling, selectedIds: ['a1b2'] });
    expect(out).toContain('- .rect_c3d4');
    expect(out).not.toContain('missing');
  });
});
