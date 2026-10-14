import { describe, expect, it } from 'vitest';

import { buildContextInline } from '@lib/contextInline';
import type { ContextInput } from '@lib/contextModel';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';

/**
 * The copy-context one-liner. It gets pasted in front of a question, so the
 * things that matter are that it stays on one line, stays short, and names
 * the element unambiguously.
 * see docs/archive/2026-08-06-copy-context-button-plan.md
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
  buildContextInline({
    target: pageTarget,
    elements: {},
    selectedIds: [],
    canvasWidth: 1440,
    breakpointLabel: 'desktop',
    ...over,
  });

const tree = (): Record<string, ScampElement> => ({
  [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['a1b2'] }),
  a1b2: el({
    id: 'a1b2',
    parentId: ROOT_ELEMENT_ID,
    childIds: ['c3d4', 'e5f6'],
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    padding: [24, 24, 24, 24],
    backgroundColor: '#f0f0f0',
    widthMode: 'fixed',
    widthValue: 400,
    heightMode: 'fixed',
    heightValue: 300,
  }),
  c3d4: el({ id: 'c3d4', parentId: 'a1b2' }),
  e5f6: el({ id: 'e5f6', parentId: 'a1b2', type: 'text', text: 'Hello world' }),
});

describe('buildContextInline — shape', () => {
  it('stays on a single line', () => {
    // It's pasted in front of a prompt; a newline would break the paste.
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).not.toContain('\n');
  });

  it('opens with the page path and the element class', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).toContain(
      'Context: app/dashboard/page.tsx → .rect_a1b2'
    );
  });

  it('points at the CSS module for the full styles', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2'] })).toContain(
      'Full styles in app/dashboard/page.module.css.'
    );
  });

  it('uses the component paths when the component editor is open', () => {
    const out = build({
      target: {
        kind: 'component',
        name: 'Button',
        tsxPath: 'components/Button/Button.tsx',
        cssPath: 'components/Button/Button.module.css',
      },
      elements: tree(),
      selectedIds: ['a1b2'],
    });
    expect(out).toContain('Context: components/Button/Button.tsx →');
    expect(out).toContain('Full styles in components/Button/Button.module.css.');
  });
});

describe('buildContextInline — style prose', () => {
  const out = (): string => build({ elements: tree(), selectedIds: ['a1b2'] });

  it('collapses display + direction into one phrase', () => {
    expect(out()).toContain('flex row');
    expect(out()).not.toContain('display: flex');
  });

  it('reports gap and padding without their property syntax', () => {
    expect(out()).toContain('gap 16px');
    expect(out()).toContain('padding 24px');
  });

  it('collapses matching width and height into W×H', () => {
    expect(out()).toContain('400×300px');
  });

  it('keeps width and height separate when their units differ', () => {
    const mixed = {
      ...tree(),
      a1b2: { ...tree()['a1b2']!, widthCustom: '50%', heightValue: 300 },
    };
    const s = build({ elements: mixed, selectedIds: ['a1b2'] });
    expect(s).toContain('width 50%');
    expect(s).toContain('height 300px');
    expect(s).not.toContain('×');
  });

  it('leads with the tag', () => {
    expect(out()).toContain('.rect_a1b2 (div, flex row');
  });

  it('reports the background colour', () => {
    expect(out()).toContain('background #f0f0f0');
  });

  it('keeps declarations outside the known vocabulary rather than dropping them', () => {
    const withBorder = {
      ...tree(),
      a1b2: {
        ...tree()['a1b2']!,
        borderRadius: [8, 8, 8, 8] as [number, number, number, number],
      },
    };
    expect(build({ elements: withBorder, selectedIds: ['a1b2'] })).toContain(
      'border-radius 8px'
    );
  });

  it('truncates a single overlong value', () => {
    // A data-URI background would otherwise swamp the whole string.
    const long = `url(data:image/png;base64,${'A'.repeat(300)})`;
    const withLong = {
      ...tree(),
      a1b2: {
        ...tree()['a1b2']!,
        customProperties: { 'background-image': long },
      },
    };
    const s = build({ elements: withLong, selectedIds: ['a1b2'] });
    expect(s).not.toContain('A'.repeat(100));
    expect(s.length).toBeLessThan(600);
  });
});

describe('buildContextInline — children', () => {
  it('counts them and lists them', () => {
    const out = build({ elements: tree(), selectedIds: ['a1b2'] });
    expect(out).toContain('2 children: .rect_c3d4 (div), .text_e5f6 (p "Hello world")');
  });

  it('uses the singular for one child', () => {
    expect(build({ elements: tree(), selectedIds: [ROOT_ELEMENT_ID] })).toContain(
      '1 child:'
    );
  });

  it('caps the list and counts the remainder', () => {
    const many: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['p'] }),
      p: el({ id: 'p', childIds: ['k0', 'k1', 'k2', 'k3', 'k4'] }),
    };
    for (const id of ['k0', 'k1', 'k2', 'k3', 'k4']) {
      many[id] = el({ id, parentId: 'p' });
    }
    const out = build({ elements: many, selectedIds: ['p'] });
    expect(out).toContain('5 children:');
    expect(out).toContain('+2 more');
    expect(out).not.toContain('.rect_k3');
  });

  it('names the component behind an instance child', () => {
    const withInstance = {
      ...tree(),
      c3d4: {
        ...tree()['c3d4']!,
        type: 'component-instance' as const,
        componentName: 'Button',
      },
    };
    expect(build({ elements: withInstance, selectedIds: ['a1b2'] })).toContain(
      '(Button)'
    );
  });

  it('says nothing about children for a leaf', () => {
    expect(build({ elements: tree(), selectedIds: ['c3d4'] })).not.toContain(
      'child'
    );
  });
});

describe('buildContextInline — nothing selected', () => {
  it('describes the page instead', () => {
    const out = build({ elements: tree() });
    expect(out).toContain('Context: app/dashboard/page.tsx —');
    expect(out).toContain('desktop breakpoint (1440px)');
    expect(out).toContain('Full page code in app/dashboard/page.tsx');
  });

  it('counts the elements on canvas, excluding the page root', () => {
    // tree() holds root + 3 drawn elements.
    expect(build({ elements: tree() })).toContain('3 elements on canvas');
  });

  it('uses the singular for a single element', () => {
    const one = {
      [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['a'] }),
      a: el({ id: 'a' }),
    };
    expect(build({ elements: one })).toContain('1 element on canvas');
  });

  it('treats a stale selection as no selection', () => {
    expect(build({ elements: tree(), selectedIds: ['gone'] })).toContain(
      'elements on canvas'
    );
  });

  it('survives no project being open', () => {
    expect(build({ target: null })).toContain('no page open');
  });
});

describe('buildContextInline — multi-select', () => {
  it('describes the primary and counts the rest', () => {
    const out = build({ elements: tree(), selectedIds: ['a1b2', 'c3d4', 'e5f6'] });
    expect(out).toContain('.rect_a1b2');
    expect(out).toContain('+2 more elements selected.');
  });

  it('uses the singular for one extra', () => {
    expect(build({ elements: tree(), selectedIds: ['a1b2', 'c3d4'] })).toContain(
      '+1 more element selected.'
    );
  });
});
