import { describe, expect, it } from 'vitest';

import {
  authoredStyles,
  breakpointFor,
  buildAgentPrompt,
  commitMessageFor,
  computedToDeclarations,
  describeChange,
  describeQueueItem,
  HISTORY_LOG_FORMAT,
  mergeRoutes,
  parseHistoryLog,
  routeHasParams,
  scopeWords,
  shortQueueItem,
  specificity,
} from '@shared/embedded';
import type { EmbeddedElementRef, EmbeddedMatchedRule } from '@shared/types';

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

  it('reads filters, transitions, grid placement, and text styles, but not their defaults', () => {
    const quiet = computed({ filter: 'none', transition: 'all 0s ease 0s', order: '0', 'white-space': 'normal', cursor: 'auto', 'grid-column': 'auto / auto' });
    const props = computedToDeclarations(quiet).map((d) => d.prop);
    for (const p of ['filter', 'transition', 'order', 'white-space', 'cursor', 'grid-column']) expect(props).not.toContain(p);
    const set = computed({ filter: 'blur(4px)', transition: 'opacity 0.2s ease 0s', order: '2', 'white-space': 'nowrap', 'text-decoration-line': 'underline', 'grid-column': '1 / 3' });
    expect(decl(set, 'filter')).toBe('blur(4px)');
    expect(decl(set, 'transition')).toBe('opacity 0.2s ease 0s');
    expect(decl(set, 'order')).toBe('2');
    expect(decl(set, 'white-space')).toBe('nowrap');
    expect(decl(set, 'text-decoration-line')).toBe('underline');
    expect(decl(set, 'grid-column')).toBe('1 / 3');
  });

  it('reads a background image’s size and position only when there is an image', () => {
    expect(decl(computed({ 'background-size': 'cover' }), 'background-size')).toBeUndefined();
    const img = computed({ 'background-image': 'url("/a.png")', 'background-size': 'cover', 'background-position': '0% 0%', 'background-repeat': 'no-repeat' });
    expect(decl(img, 'background-image')).toBe('url("/a.png")');
    expect(decl(img, 'background-size')).toBe('cover');
    expect(decl(img, 'background-position')).toBeUndefined();
    expect(decl(img, 'background-repeat')).toBe('no-repeat');
  });

  it('reads an outline, an animation, and a transform’s origin only when they apply', () => {
    expect(decl(computed({ 'outline-style': 'none', 'transform-origin': '10px 10px', 'animation-name': 'none', animation: 'none' }), 'outline')).toBeUndefined();
    const c = computed({ 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgb(255, 0, 0)', transform: 'rotate(5deg)', 'transform-origin': '10px 10px', 'animation-name': 'spin', animation: '1s linear 0s infinite normal none running spin' });
    expect(decl(c, 'outline')).toBe('2px solid rgb(255, 0, 0)');
    expect(decl(c, 'transform-origin')).toBe('10px 10px');
    expect(decl(c, 'animation')).toBe('1s linear 0s infinite normal none running spin');
  });

  it('skips properties the page didn’t report', () => {
    expect(computedToDeclarations({})).toEqual([]);
  });
});

describe('specificity', () => {
  it('counts ids, classes, and types', () => {
    expect(specificity('div')).toEqual([0, 0, 1]);
    expect(specificity('.card')).toEqual([0, 1, 0]);
    expect(specificity('#main .card > h2')).toEqual([1, 1, 1]);
    expect(specificity('a[href]:hover::before')).toEqual([0, 2, 2]);
  });

  it('counts nothing for :where, and the contents of :is and :not', () => {
    expect(specificity(':where(.a, .b) p')).toEqual([0, 0, 1]);
    expect(specificity('p:not(.x)')).toEqual([0, 1, 1]);
  });

  it('reads an escaped Tailwind class as one class', () => {
    expect(specificity('.md\\:p-4')).toEqual([0, 1, 0]);
  });
});

describe('authoredStyles', () => {
  const rule = (selectors: string[], decls: Record<string, string>, patch: Partial<EmbeddedMatchedRule> = {}): EmbeddedMatchedRule => ({
    selectors,
    text: '',
    sheet: '/src/App.css',
    layer: null,
    decls: Object.fromEntries(Object.entries(decls).map(([p, v]) => [p, { value: v, important: false }])),
    ...patch,
  });

  it('takes the more specific rule, then the later one', () => {
    expect(authoredStyles([rule(['.card'], { width: '50%' }), rule(['div'], { width: 'auto' })], {})).toEqual({ width: '50%' });
    expect(authoredStyles([rule(['.a'], { width: '50%' }), rule(['.b'], { width: 'auto' })], {})).toEqual({ width: 'auto' });
  });

  it('lets an inline style beat a rule, and important beat both', () => {
    const inline = rule(['style'], { color: 'red' }, { sheet: 'inline' });
    expect(authoredStyles([rule(['#x'], { color: 'blue' }), inline], {})).toEqual({ color: 'red' });
    const important = rule(['p'], { color: 'green' });
    important.decls['color'] = { value: 'green', important: true };
    expect(authoredStyles([important, inline], {})).toEqual({ color: 'green' });
  });

  it('lets an unlayered rule beat a layered one, and a later layer an earlier one', () => {
    expect(authoredStyles([rule(['p'], { color: 'blue' }), rule(['#x'], { color: 'red' }, { layer: 0 })], {})).toEqual({ color: 'blue' });
    expect(authoredStyles([rule(['#x'], { color: 'red' }, { layer: 1 }), rule(['p'], { color: 'blue' }, { layer: 2 })], {})).toEqual({ color: 'blue' });
  });

  it('keeps tokens, but not Tailwind’s spacing math, keywords, or tokens on a layout keyword', () => {
    const out = authoredStyles(
      [rule(['.a'], { 'background-color': 'var(--accent)', 'padding-top': 'calc(var(--spacing) * 4)', color: 'inherit', display: 'var(--d)' })],
      {}
    );
    expect(out).toEqual({ 'background-color': 'var(--accent)' });
  });

  it('drops a pixel value the page doesn’t have, since a rule Scamp couldn’t see won', () => {
    expect(authoredStyles([rule(['.a'], { width: '100px' })], { width: '120px' })).toEqual({});
    expect(authoredStyles([rule(['.a'], { width: '120px' })], { width: '120px' })).toEqual({ width: '120px' });
  });

  it('is empty when no rule matches', () => {
    expect(authoredStyles([], { width: '10px' })).toEqual({});
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

  it('asks for a move of the JSX, or of where a component is used', () => {
    const text = describeQueueItem(
      { id: 'm', kind: 'move', element: element({ tag: 'h2', text: 'Hours' }), target: element({ tag: 'h1', text: 'Team', source: 'src/App.jsx:8:5' }), position: 'before', fromList: false },
      0
    );
    expect(text).toContain('### Edit 1: move');
    expect(text).toContain('- Move it to just **before** this sibling (same parent):');
    expect(text).toContain('  - Element: <h1>');
    expect(text).toContain('  - Written at: src/App.jsx:8:5');
    expect(text).toContain('If the element is the root of a component, move where that component is used instead.');
  });

  it('says the order of a list is the data’s, and not to invent a change', () => {
    const text = describeQueueItem({ id: 'l', kind: 'move', element: element(), target: element({ text: 'Grace Hopper' }), position: 'after', fromList: true }, 0);
    expect(text).toContain('their order is the data');
    expect(text).toContain('change nothing and say so');
    expect(text).not.toContain('move where that component is used');
  });

  it('carries an instruction, with or without a selection', () => {
    expect(describeQueueItem({ id: 'b', kind: 'instruction', element: null, scope: 'instance', text: 'tighten the spacing' }, 0)).toBe('### Edit 1: instruction\n- Do this: tighten the spacing');
    expect(describeQueueItem({ id: 'b', kind: 'instruction', element: element({ instanceCount: 1 }), scope: 'instance', text: 'make it bold' }, 0)).toContain('Scope: this element.');
  });
});

describe('this instance only', () => {
  const style = (patch: Partial<EmbeddedElementRef>): string =>
    describeQueueItem({ id: 'a', kind: 'style', element: element(patch), scope: 'instance', changes: [{ property: 'color', from: '', to: 'red' }] }, 0);

  it('names the exact place this instance is used', () => {
    expect(style({ usedInList: false })).toContain('Scope: this instance only, the one used at src/CardList.tsx:8:7. Override it there');
    expect(style({ usedInList: false })).toContain('so the other 2 stay as they are');
  });

  it('says which one of a list it is, and to pick it out by key or index, or change nothing', () => {
    const text = style({ usedInList: true, instanceIndex: 1 });
    expect(text).toContain('number 2 of 3 on the page');
    expect(text).toContain('one line in a list (a `.map()` or loop) at src/CardList.tsx:8:7');
    expect(text).toContain('add a condition on its key, index, or data');
    expect(text).toContain('change nothing and say so');
  });

  it('falls back to the general wording without a place it’s used', () => {
    expect(style({ usedAt: null })).toContain('Scope: this instance only. Leave the other instances as they are');
  });
});

describe('structure edits, more than one element, and moving inside', () => {
  it('asks to delete, duplicate, or wrap, with what to do for a list', () => {
    const del = describeQueueItem({ id: 's', kind: 'structure', action: 'delete', element: element(), scope: 'all' }, 0);
    expect(del).toContain('### Edit 1: delete');
    expect(del).toContain('Delete the element’s JSX');
    expect(del).toContain('Change the shared definition');
    expect(describeQueueItem({ id: 's', kind: 'structure', action: 'duplicate', element: element(), scope: 'instance' }, 0)).toContain('Add a copy of the element’s JSX right after it');
    expect(describeQueueItem({ id: 's', kind: 'structure', action: 'wrap', element: element(), scope: 'instance' }, 0)).toContain('move the `key` to the wrapper');
  });

  it('describes structure edits in plain words', () => {
    expect(describeChange({ id: 's', kind: 'structure', action: 'delete', element: element({ tag: 'p' }), scope: 'instance' }).text).toBe('Deleted Text in Card');
    expect(describeChange({ id: 's', kind: 'structure', action: 'wrap', element: element({ tag: 'p' }), scope: 'all' }).text).toBe('Wrapped every Text in Card in a container');
    expect(shortQueueItem({ id: 's', kind: 'structure', action: 'duplicate', element: element(), scope: 'instance' })).toBe('Duplicate <div>');
  });

  it('lists the other selected elements for the agent, and counts them for people', () => {
    const item = { id: 'a', kind: 'style' as const, element: element(), also: [element({ tag: 'h2', text: 'Grace' }), element({ tag: 'p', text: 'Bio' })], scope: 'instance' as const, changes: [{ property: 'color', from: '', to: 'red' }] };
    const text = describeQueueItem(item, 0);
    expect(text).toContain('Do the same to these 2 elements, selected with it:');
    expect(text).toContain('    - Element: <h2>');
    expect(describeChange(item).text).toBe('Changed color on Card and 2 more');
  });

  it('asks to move an element into another, as its last child', () => {
    const item = { id: 'm', kind: 'move' as const, element: element({ tag: 'h2', text: 'Hours' }), target: element({ tag: 'aside', text: '' }), position: 'inside' as const, fromList: false };
    const text = describeQueueItem(item, 0);
    expect(text).toContain('### Edit 1: move into another element');
    expect(text).toContain('Move it **inside** this element, as its last child:');
    expect(describeChange(item).text).toBe('Moved Heading in Card into Card');
    expect(shortQueueItem(item)).toBe('Move <h2> into <aside>');
  });
});

describe('scopeWords', () => {
  it('names the buttons after the component its instances are', () => {
    expect(scopeWords(element({ instanceOf: 'Card' }))).toEqual({
      one: 'This Card',
      every: 'Every Card · 3',
      oneTip: 'Changes only this Card, where it’s used at src/CardList.tsx:8:7',
      everyTip: 'Changes the Card component: all 3 on this page, and anywhere else it’s used',
    });
  });

  it('says which of a list this one is', () => {
    expect(scopeWords(element({ instanceOf: 'Card', usedInList: true, instanceIndex: 0 })).oneTip).toBe('Changes only this Card, number 1 of 3 in a list');
  });

  it('falls back to plain words for a list inside one component', () => {
    expect(scopeWords(element({ instanceOf: null }))).toEqual({
      one: 'This one',
      every: 'All 3',
      oneTip: 'Changes only this one',
      everyTip: 'Changes the shared code: all 3 on this page',
    });
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

describe('breakpointFor', () => {
  it('is null at desktop', () => {
    expect(breakpointFor(null, [640, 768], 'min')).toBeNull();
  });

  it('applies up to just under the project’s next breakpoint above the width', () => {
    expect(breakpointFor(390, [1024, 640, 768], 'min')).toEqual({ width: 390, upTo: 639, project: [640, 768, 1024], direction: 'min' });
    expect(breakpointFor(768, [640, 768, 1024], 'min')?.upTo).toBe(1023);
  });

  it('applies up to the width itself when the project has nothing above it, or no breakpoints', () => {
    expect(breakpointFor(1200, [640, 768], 'min')?.upTo).toBe(1200);
    expect(breakpointFor(390, [], null)).toEqual({ width: 390, upTo: 390, project: [], direction: null });
  });
});

describe('describeQueueItem with a breakpoint', () => {
  it('tells the agent the width, the range, and the project’s direction', () => {
    const text = describeQueueItem(
      { id: 'b', kind: 'style', element: element(), scope: 'all', breakpoint: { width: 390, upTo: 639, project: [640, 768], direction: 'min' }, changes: [{ property: 'padding', from: '24px', to: '12px' }] },
      0
    );
    expect(text).toContain('Breakpoint: the user made this edit with the app 390px wide. Apply it at widths up to 639px (`@media (max-width: 639px)`)');
    expect(text).toContain('640px, 768px, written mobile-first (`min-width`)');
    expect(text).toContain('`p-4 md:p-6`');
  });
});

describe('shortQueueItem', () => {
  it('names the state and the width an edit was made at', () => {
    expect(
      shortQueueItem({ id: 's', kind: 'style', element: element({ tag: 'a' }), scope: 'instance', state: 'hover', breakpoint: { width: 390, upTo: 390, project: [], direction: null }, changes: [{ property: 'color', from: '', to: 'red' }] })
    ).toBe('<a:hover @390> color → red');
  });

  it('describes moves and instructions', () => {
    expect(shortQueueItem({ id: 'm', kind: 'move', element: element({ tag: 'p' }), target: element({ tag: 'h1', text: 'Team' }), position: 'before', fromList: false })).toBe('Move <p> before <h1> “Team”');
    expect(shortQueueItem({ id: 'i', kind: 'instruction', element: null, scope: 'instance', text: 'tighten it' })).toBe('tighten it');
  });
});

describe('content edits', () => {
  const heading = element({ tag: 'h1', components: ['App'], text: 'Team' });
  it('tells the agent the value, and where it’s written: the JSX, an import, or where the component is used', () => {
    const literal = describeQueueItem({ id: 'c', kind: 'content', element: heading, field: 'text', from: 'Team', to: 'Our team', origin: { kind: 'literal', value: 'Team', at: 'src/App.jsx:8' } }, 0);
    expect(literal).toContain('### Edit 1: text');
    expect(literal).toContain('- Change the text from “Team” to “Our team”.');
    expect(literal).toContain('It’s written in the code at src/App.jsx:8. Change it there.'.replace('’', "'"));
    const prop = describeQueueItem(
      { id: 'p', kind: 'content', element: heading, field: 'text', from: 'New', to: 'Fresh', origin: { kind: 'prop', value: 'New', at: 'src/App.jsx:22', prop: 'label', component: 'Badge' } },
      0
    );
    expect(prop).toContain('It comes from the `label` prop of Badge, written where Badge is used, at src/App.jsx:22.');
    expect(prop).toContain("don't change Badge itself or its default");
    const image = describeQueueItem(
      { id: 'i', kind: 'content', element: element({ tag: 'img' }), field: 'src', from: '', to: '/new.png', origin: { kind: 'import', value: './logo.png', at: 'src/App.jsx:1' } },
      0
    );
    expect(image).toContain('Change the image from (none) to “/new.png”.');
    expect(image).toContain('imported file (`./logo.png`)');
  });

  it('describes a content edit plainly, with the old and new values as detail', () => {
    expect(
      describeChange({ id: 'c', kind: 'content', element: element({ tag: 'a', components: ['App'] }), field: 'href', from: '/about', to: '/team', origin: { kind: 'literal', value: '/about', at: 'x:1' } })
    ).toEqual({ text: 'Changed the link on Link', detail: '<a> link “/about” → “/team”' });
  });
});

describe('describeChange', () => {
  const card = element({ tag: 'article', components: ['Card', 'App'], text: 'Ada' });
  const style = (patch: Record<string, unknown>, changes: Array<{ property: string; from: string; to: string }>) =>
    ({ id: 's', kind: 'style', element: card, scope: 'instance', changes, ...patch }) as Parameters<typeof describeChange>[0];

  it('names the kind of change and the component a container draws, with the technical form as detail', () => {
    expect(describeChange(style({ scope: 'all' }, [{ property: 'padding', from: '16px', to: '24px' }]))).toEqual({
      text: 'Changed spacing on every Card',
      detail: '<article> padding → 24px (all)',
    });
    expect(describeChange(style({}, [{ property: 'background-color', from: '', to: 'red' }])).text).toBe('Changed color on Card');
    expect(describeChange(style({}, [{ property: 'display', from: 'block', to: 'flex' }])).text).toBe('Changed layout on Card');
  });

  it('says what an element is, and the component it sits in, leaving out the app itself', () => {
    expect(describeChange(style({ element: element({ tag: 'h2', components: ['Card', 'App'] }) }, [{ property: 'font-size', from: '', to: '20px' }])).text).toBe(
      'Changed text style on Heading in Card'
    );
    expect(describeChange(style({ element: element({ tag: 'button', components: ['App'] }) }, [{ property: 'color', from: '', to: 'red' }])).text).toBe('Changed color on Button');
    expect(describeChange(style({ element: element({ tag: 'div', components: [] }) }, [{ property: 'color', from: '', to: 'red' }])).text).toBe('Changed color on Box');
  });

  it('resizes, rounds corners, and restyles when several kinds change at once', () => {
    expect(describeChange(style({}, [{ property: 'width', from: '', to: '200px' }])).text).toBe('Resized Card');
    expect(describeChange(style({}, [{ property: 'border-radius', from: '', to: '8px' }])).text).toBe('Changed the corners on Card');
    expect(describeChange(style({}, [{ property: 'color', from: '', to: 'red' }, { property: 'padding', from: '', to: '4px' }])).text).toBe('Restyled Card');
  });

  it('adds the state and the width it applies at', () => {
    const bp = (width: number) => ({ width, upTo: width, project: [], direction: null });
    expect(describeChange(style({ state: 'hover' }, [{ property: 'color', from: '', to: 'red' }])).text).toBe('Changed color on Card (hover)');
    expect(describeChange(style({ breakpoint: bp(390) }, [{ property: 'color', from: '', to: 'red' }])).text).toBe('Changed color on Card on mobile');
    expect(describeChange(style({ breakpoint: bp(768) }, [{ property: 'color', from: '', to: 'red' }])).text).toBe('Changed color on Card on tablet');
    expect(describeChange(style({ breakpoint: bp(1200) }, [{ property: 'color', from: '', to: 'red' }])).text).toBe('Changed color on Card at 1200px');
  });

  it('describes moves by the target’s text, and instructions in the user’s own words', () => {
    expect(
      describeChange({ id: 'm', kind: 'move', element: element({ tag: 'p', components: ['App'] }), target: element({ tag: 'h1', text: 'Team' }), position: 'before', fromList: false }).text
    ).toBe('Moved Text before “Team”');
    expect(describeChange({ id: 'i', kind: 'instruction', element: null, scope: 'instance', text: 'tighten the spacing' })).toEqual({ text: 'tighten the spacing', detail: '' });
  });
});

describe('commitMessageFor', () => {
  const a = { text: 'Changed spacing on every Card', detail: '<article> padding → 24px (all)' };
  const b = { text: 'Moved Text before “Team”', detail: 'Move <p> before <h1> “Team”' };

  it('uses the user’s subject when they typed one, with each change and its technical form in the body', () => {
    expect(commitMessageFor('  Restyle the cards ', [a, b], ['a.css'])).toEqual({
      subject: 'Restyle the cards',
      body: '- Changed spacing on every Card\n  <article> padding → 24px (all)\n- Moved Text before “Team”\n  Move <p> before <h1> “Team”',
    });
  });

  it('makes the subject from the first change in plain words, counting the rest', () => {
    expect(commitMessageFor('', [a, b, b], ['a.css']).subject).toBe('Changed spacing on every Card, and 2 more');
    expect(commitMessageFor('', [a], ['a.css']).subject).toBe('Changed spacing on every Card');
  });

  it('writes a change with no technical form on one line, and falls back to the files with none at all', () => {
    expect(commitMessageFor('', [{ text: 'tighten it', detail: '' }], ['a.css']).body).toBe('- tighten it');
    expect(commitMessageFor('', [], ['a.css', 'b.css'])).toEqual({ subject: 'update a.css, b.css', body: '' });
  });
});

describe('parseHistoryLog', () => {
  const record = (sha: string, time: number, subject: string, body: string, files: string[]): string =>
    HISTORY_LOG_FORMAT.replace('%x1e', '\x1e')
      .replace('%H', sha)
      .replace('%ct', String(time))
      .replace('%s', subject)
      .replace('%b', body)
      .replaceAll('%x1f', '\x1f') + `\n\n${files.join('\n')}\n`;

  it('reads each commit with its changes, their technical form, and files, newest first', () => {
    const text =
      record('a'.repeat(40), 200, 'Scamp: Changed spacing on every Card', '- Changed spacing on every Card\n  <article> padding → 24px (all)\n- tighten it\n', ['src/Card.module.css', 'src/App.jsx']) +
      record('b'.repeat(40), 100, 'my own commit', '', ['README.md']);
    expect(parseHistoryLog(text)).toEqual([
      {
        sha: 'a'.repeat(40),
        time: 200,
        subject: 'Scamp: Changed spacing on every Card',
        changes: [
          { text: 'Changed spacing on every Card', detail: '<article> padding → 24px (all)' },
          { text: 'tighten it', detail: '' },
        ],
        files: ['src/Card.module.css', 'src/App.jsx'],
      },
      { sha: 'b'.repeat(40), time: 100, subject: 'my own commit', changes: [], files: ['README.md'] },
    ]);
  });

  it('reads an older commit, with only the technical lines, as its text', () => {
    const text = record('c'.repeat(40), 50, 'Scamp: x', '- <div> padding → 24px\n', ['a.css']);
    expect(parseHistoryLog(text)[0]?.changes).toEqual([{ text: '<div> padding → 24px', detail: '' }]);
  });

  it('ignores empty output and records without a commit id', () => {
    expect(parseHistoryLog('')).toEqual([]);
    expect(parseHistoryLog('\x1enot-a-sha\x1f1\x1fs\x1f\x1f')).toEqual([]);
  });
});

