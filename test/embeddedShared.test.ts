import { describe, expect, it } from 'vitest';

import { buildAgentPrompt, computedToDeclarations, describeQueueItem, mergeRoutes, routeHasParams } from '@shared/embedded';
import type { EmbeddedElementRef } from '@shared/types';

const computed = (patch: Record<string, string>): Record<string, string> => ({
  display: 'block',
  position: 'static',
  width: '320px',
  height: '48px',
  'padding-top': '16px',
  'padding-right': '16px',
  'padding-bottom': '16px',
  'padding-left': '16px',
  'margin-top': '0px',
  'margin-right': '0px',
  'margin-bottom': '0px',
  'margin-left': '0px',
  'border-top-width': '0px',
  'border-right-width': '0px',
  'border-bottom-width': '0px',
  'border-left-width': '0px',
  'border-top-style': 'none',
  'border-top-color': 'rgb(0, 0, 0)',
  'border-top-left-radius': '0px',
  'border-top-right-radius': '0px',
  'border-bottom-right-radius': '0px',
  'border-bottom-left-radius': '0px',
  'background-color': 'rgb(255, 255, 255)',
  'box-shadow': 'none',
  transform: 'none',
  'overflow-x': 'visible',
  'overflow-y': 'visible',
  ...patch,
});

const decl = (c: Record<string, string>, prop: string): string | undefined => computedToDeclarations(c).find((d) => d.prop === prop)?.value;

describe('computedToDeclarations', () => {
  it('folds four equal sides into one value, and pairs into two', () => {
    expect(decl(computed({}), 'padding')).toBe('16px');
    expect(decl(computed({ 'padding-right': '8px', 'padding-left': '8px' }), 'padding')).toBe('16px 8px');
    expect(decl(computed({ 'padding-left': '4px' }), 'padding')).toBe('16px 16px 16px 4px');
  });

  it('leaves out a border with no style, and writes one that has one', () => {
    expect(decl(computed({}), 'border-width')).toBeUndefined();
    const bordered = computed({ 'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px', 'border-top-style': 'solid' });
    expect(decl(bordered, 'border-width')).toBe('1px');
    expect(decl(bordered, 'border-style')).toBe('solid');
  });

  it('writes a radius only when there is one', () => {
    expect(decl(computed({}), 'border-radius')).toBeUndefined();
    expect(decl(computed({ 'border-top-left-radius': '8px', 'border-top-right-radius': '8px', 'border-bottom-right-radius': '8px', 'border-bottom-left-radius': '8px' }), 'border-radius')).toBe('8px');
  });

  it('drops values the browser reports at their default', () => {
    const props = computedToDeclarations(computed({})).map((d) => d.prop);
    expect(props).not.toContain('box-shadow');
    expect(props).not.toContain('transform');
    expect(props).not.toContain('position');
    expect(props).not.toContain('overflow');
  });

  it('places an absolute element, and keeps a shared overflow', () => {
    const c = computed({ position: 'absolute', left: '12px', top: '40px', 'overflow-x': 'hidden', 'overflow-y': 'hidden' });
    expect(decl(c, 'position')).toBe('absolute');
    expect(decl(c, 'left')).toBe('12px');
    expect(decl(c, 'overflow')).toBe('hidden');
  });

  it('skips properties the page didn’t report', () => {
    expect(computedToDeclarations({})).toEqual([]);
  });
});

const element = (patch: Partial<EmbeddedElementRef> = {}): EmbeddedElementRef => ({
  source: 'src/components/Card.tsx:12:5',
  library: null,
  page: '/',
  selector: 'main.page > section.cards > div.card',
  tag: 'div',
  classes: ['_card_x1'],
  components: ['Card', 'CardList'],
  instanceCount: 3,
  usedAt: 'src/CardList.tsx:8:7',
  text: 'Ada Lovelace',
  ...patch,
});

describe('describeQueueItem', () => {
  it('names the element, its source, the scope, and each change', () => {
    const text = describeQueueItem(
      { id: 'a', kind: 'style', element: element(), scope: 'instance', changes: [{ property: 'padding', from: '16px', to: '24px' }] },
      0
    );
    expect(text).toContain('### Edit 1: style');
    expect(text).toContain('Written at: src/components/Card.tsx:12:5');
    expect(text).toContain('That component is used at: src/CardList.tsx:8:7');
    expect(text).toContain('draws 3 elements');
    expect(text).toContain('this instance only');
    expect(text).toContain('`padding`: `16px` → `24px`');
  });

  it('asks for the shared definition when every instance changes', () => {
    const text = describeQueueItem({ id: 'a', kind: 'style', element: element(), scope: 'all', changes: [{ property: 'color', from: '', to: 'red' }] }, 1);
    expect(text).toContain('### Edit 2');
    expect(text).toContain('Change the shared definition');
    expect(text).toContain('`color`: (not set) → `red`');
  });

  it('asks the agent to search for an element Scamp couldn’t map, with what it knows', () => {
    const text = describeQueueItem({ id: 'u', kind: 'style', element: element({ source: null, usedAt: null }), scope: 'instance', changes: [{ property: 'color', from: '', to: 'red' }] }, 0);
    expect(text).toContain('- Written at: not mapped. Find it: search the project for its classes, its text and the component names below');
    expect(text).toContain('- On the page: `/`, at `main.page > section.cards > div.card`');
    expect(text).toContain('Inside components: Card › CardList');
  });

  it('tells the agent to style a library’s element from the project, never node_modules', () => {
    const text = describeQueueItem({ id: 'l', kind: 'style', element: element({ source: null, library: '@radix-ui/react-menu' }), scope: 'instance', changes: [{ property: 'color', from: '', to: 'red' }] }, 0);
    expect(text).toContain('Drawn by @radix-ui/react-menu, a library. Never edit `node_modules`');
  });

  it('names the pseudo-class when the edit was made in a forced state', () => {
    const text = describeQueueItem(
      { id: 'h', kind: 'style', element: element(), scope: 'all', state: 'hover', changes: [{ property: 'background-color', from: 'rgb(255, 255, 255)', to: 'rgb(0, 0, 0)' }] },
      0
    );
    expect(text).toContain('### Edit 1: style (:hover)');
    expect(text).toContain('a `:hover` rule, or Tailwind’s `hover:` prefix'.replace('’', "'"));
  });

  it('leaves the state out of an edit made in the default state', () => {
    const text = describeQueueItem({ id: 'a', kind: 'style', element: element(), scope: 'all', changes: [{ property: 'color', from: '', to: 'red' }] }, 0);
    expect(text).not.toContain('State:');
  });

  it('carries an instruction, with or without a selection', () => {
    expect(describeQueueItem({ id: 'b', kind: 'instruction', element: null, scope: 'instance', text: 'tighten the spacing' }, 0)).toBe('### Edit 1: instruction\n- Do this: tighten the spacing');
    expect(describeQueueItem({ id: 'b', kind: 'instruction', element: element({ instanceCount: 1 }), scope: 'instance', text: 'make it bold' }, 0)).toContain('Scope: this element.');
  });
});

describe('buildAgentPrompt', () => {
  it('states the project’s idiom and every edit in the batch', () => {
    const prompt = buildAgentPrompt(
      [
        { id: 'a', kind: 'style', element: element(), scope: 'all', changes: [{ property: 'padding', from: '16px', to: '24px' }] },
        { id: 'b', kind: 'instruction', element: null, scope: 'instance', text: 'tighten the spacing' },
      ],
      ['tailwind', 'css-modules']
    );
    expect(prompt).toMatch(/^Make these 2 changes/);
    expect(prompt).toContain('Tailwind');
    expect(prompt).toContain('CSS Modules');
    expect(prompt).toContain('### Edit 1: style');
    expect(prompt).toContain('### Edit 2: instruction');
  });

  it('speaks of one change in the singular', () => {
    expect(buildAgentPrompt([{ id: 'b', kind: 'instruction', element: null, scope: 'instance', text: 'x' }], ['plain-css'])).toMatch(/^Make this change/);
  });
});

describe('mergeRoutes', () => {
  it('keeps one of each path, pages before parameterised ones, alphabetical within each', () => {
    expect(mergeRoutes(['/about'], ['/blog/[slug]', '/', '/about', '/users/:id', '/blog'])).toEqual(['/', '/about', '/blog', '/blog/[slug]', '/users/:id']);
  });

  it('drops trailing slashes, queries and hashes, and anything that isn’t a path', () => {
    expect(mergeRoutes([], ['/team/', '/team?tab=1', '/team#top', 'https://elsewhere.com/x', '//cdn.example.com/a', '', '/files/*'])).toEqual(['/team']);
  });

  it('caps the list', () => {
    expect(mergeRoutes([], ['/a', '/b', '/c'], 2)).toEqual(['/a', '/b']);
  });
});

describe('routeHasParams', () => {
  it('spots React Router and Next.js params', () => {
    expect(routeHasParams('/users/:id')).toBe(true);
    expect(routeHasParams('/blog/[slug]')).toBe(true);
    expect(routeHasParams('/docs/[[...slug]]')).toBe(true);
    expect(routeHasParams('/about')).toBe(false);
  });
});
