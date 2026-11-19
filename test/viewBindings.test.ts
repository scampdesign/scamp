import { describe, it, expect } from 'vitest';

import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import {
  BIND_MARK,
  decodeBinding,
  hoistBindings,
  parsePropsDefaults,
} from '@lib/parseCode/bindings';
import {
  collectViewProps,
  enclosingRepeat,
  propsTypeSource,
  rowTypeFor,
  viewEventNames,
} from '@lib/viewProps';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

/**
 * The binding grammar: model → file → model, per kind, plus the
 * pre-pass and the props-type inference. The byte-for-byte check
 * against the published fixture is `contract0Drift.test.ts`.
 * see docs/notes/view-bindings.md
 */

const rect = (id: string, parentId: string | null, extra: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'rectangle',
  parentId,
  childIds: [],
  x: 0,
  y: 0,
  widthMode: 'auto',
  heightMode: 'auto',
  customProperties: {},
  inlineFragments: [],
  ...extra,
});

const text = (id: string, parentId: string, body: string, extra: Partial<ScampElement> = {}): ScampElement => ({
  ...rect(id, parentId),
  type: 'text',
  text: body,
  ...extra,
});

const image = (id: string, parentId: string, extra: Partial<ScampElement> = {}): ScampElement => ({
  ...rect(id, parentId),
  type: 'image',
  src: '',
  alt: '',
  ...extra,
});

const root = (childIds: string[], extra: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_ROOT_STYLES,
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds,
  x: 0,
  y: 0,
  customProperties: {},
  inlineFragments: [],
  minHeight: undefined,
  ...extra,
});

const gen = (elements: Record<string, ScampElement>): { tsx: string; css: string } =>
  generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: 'Card',
    cssModuleImportName: 'Card',
    breakpoints: DEFAULT_BREAKPOINTS,
    isComponent: true,
  });

const roundTrip = (elements: Record<string, ScampElement>): Record<string, ScampElement> => {
  const { tsx, css } = gen(elements);
  return parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements;
};

describe('hoistBindings', () => {
  it('quotes a braced attribute with the marker and leaves className alone', () => {
    const out = hoistBindings(`<a data-scamp-id="l_1" className={styles.l_1} href={url}>x</a>`);
    expect(out).toBe(`<a data-scamp-id="l_1" className={styles.l_1} href="${BIND_MARK}url">x</a>`);
  });

  it('keeps an arrow handler whole', () => {
    const out = hoistBindings(`<button data-scamp-id="b_1" className={styles.b_1} onClick={() => onCopy?.(player.id)}>c</button>`);
    expect(out).toContain(`onClick="${BIND_MARK}() => onCopy?.(player.id)"`);
  });

  it('never touches JSX-valued props or tags without a Scamp id', () => {
    const src = `<Card data-scamp-instance-id="inst_1" left={<div />} />\n<div title={x} />`;
    expect(hoistBindings(src)).toBe(src);
  });

  it('turns the repeat and show wrappers into pseudo-tags, matched by indent', () => {
    const src = [
      '      {players.map((player) => (',
      '        <LinkCard data-scamp-instance-id="inst_1" key={player.id} />',
      '      ))}',
      '      {waiting && (',
      '        <p data-scamp-id="w_1" className={styles.w_1}>Waiting</p>',
      '      )}',
    ].join('\n');
    expect(hoistBindings(src).split('\n')).toEqual([
      '      <scamp-repeat over="players" as="player">',
      `        <LinkCard data-scamp-instance-id="inst_1" key="${BIND_MARK}player.id" />`,
      '      </scamp-repeat>',
      '      <scamp-show if="waiting">',
      '        <p data-scamp-id="w_1" className={styles.w_1}>Waiting</p>',
      '      </scamp-show>',
    ]);
  });
});

describe('decodeBinding', () => {
  it('reads prop, inverted, and row-path bindings', () => {
    expect(decodeBinding('href', `${BIND_MARK}url`)).toEqual({ kind: 'bind', expr: 'url' });
    expect(decodeBinding('disabled', `${BIND_MARK}!canStart`)).toEqual({ kind: 'bind', expr: '!canStart' });
    expect(decodeBinding('label', `${BIND_MARK}player.label`)).toEqual({ kind: 'bind', expr: 'player.label' });
  });

  it('reads plain and in-repeat event handlers', () => {
    expect(decodeBinding('onClick', `${BIND_MARK}onStart`)).toEqual({ kind: 'event', handler: 'onStart', rowKey: null });
    expect(decodeBinding('onClick', `${BIND_MARK}() => onCopy?.(player.id)`)).toEqual({ kind: 'event', handler: 'onCopy', rowKey: 'id' });
  });

  it('keeps anything outside the grammar verbatim, and ignores plain strings', () => {
    expect(decodeBinding('href', `${BIND_MARK}base + path`)).toEqual({ kind: 'verbatim', expr: 'base + path' });
    expect(decodeBinding('href', 'https://x')).toBeNull();
  });
});

describe('parsePropsDefaults', () => {
  it('reads strings, booleans, rows with numbers, and bare names', () => {
    const tsx = `export default function Lobby({
  code = "KZQ4",
  players = [
    { id: "1", label: "A \\"quoted\\" one", score: 3 },
    { id: "2", label: "B", score: 12 },
  ],
  waiting = true,
  canStart = false,
  onStart,
  className,
}: LobbyProps) {`;
    const out = parsePropsDefaults(tsx);
    expect(out.get('code')).toBe('KZQ4');
    expect(out.get('players')).toEqual([
      { id: '1', label: 'A "quoted" one', score: 3 },
      { id: '2', label: 'B', score: 12 },
    ]);
    expect(out.get('waiting')).toBe(true);
    expect(out.get('canStart')).toBe(false);
    expect(out.has('onStart')).toBe(true);
    expect(out.get('onStart')).toBeUndefined();
    expect(out.has('className')).toBe(true);
  });

  it('returns an empty map for a page or a non-destructured signature', () => {
    expect(parsePropsDefaults('export default function Home() {').size).toBe(0);
    expect(parsePropsDefaults('export default function Home(props: HomeProps) {').size).toBe(0);
  });
});

describe('rowTypeFor', () => {
  it('types a field number only when every row holds a number', () => {
    expect(rowTypeFor([{ id: '1', n: 1 }, { id: '2', n: 2 }])).toBe('Array<{ id: string; n: number }>');
    expect(rowTypeFor([{ id: '1', n: 1 }, { id: '2', n: 'x' }])).toBe('Array<{ id: string; n: string }>');
    expect(rowTypeFor([])).toBe('Array<Record<string, string>>');
  });
});

describe('collectViewProps', () => {
  it('orders non-event props by document, then events, then slots', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['h', 'list', 'note', 'btn', 'slot'], { samples: { players: [{ id: '1', label: 'A' }], waiting: true } }),
      h: text('h', ROOT_ELEMENT_ID, 'KZQ4', { prop: 'code' }),
      list: rect('list', ROOT_ELEMENT_ID, { childIds: ['card'], display: 'flex' }),
      card: { ...rect('card', 'list'), type: 'component-instance', componentName: 'LinkCard', instanceId: 'inst_1', repeat: { over: 'players', as: 'player' }, bind: { label: 'player.label' }, childIds: ['copy'] },
      copy: text('copy', 'card', 'Copy', { tag: 'button', on: { onClick: 'onCopy' } }),
      note: text('note', ROOT_ELEMENT_ID, 'Waiting', { showIf: 'waiting' }),
      btn: text('btn', ROOT_ELEMENT_ID, 'Start', { tag: 'button', attributes: { type: 'button', disabled: '' }, bind: { disabled: '!canStart' }, on: { onClick: 'onStart' } }),
      slot: rect('slot', ROOT_ELEMENT_ID, { slot: 'children' }),
    };
    const props = collectViewProps(elements, ROOT_ELEMENT_ID);
    expect(props.map((p) => [p.name, p.kind, p.tsType])).toEqual([
      ['code', 'text', 'string'],
      ['players', 'repeat', 'Array<{ id: string; label: string }>'],
      ['waiting', 'show', 'boolean'],
      ['canStart', 'boolean', 'boolean'],
      ['onCopy', 'event', '(id: string) => void'],
      ['onStart', 'event', '() => void'],
      ['children', 'slot', 'React.ReactNode'],
    ]);
    expect(props.find((p) => p.name === 'canStart')?.defaultValue).toBe(false);
    expect(viewEventNames(props)).toEqual(['onCopy', 'onStart']);
  });

  it('finds the enclosing repeat through instance children', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['card']),
      card: { ...rect('card', ROOT_ELEMENT_ID), type: 'component-instance', componentName: 'X', instanceId: 'i', repeat: { over: 'rows', as: 'row' }, childIds: ['t'] },
      t: text('t', 'card', '', { prop: 'row.name' }),
    };
    expect(enclosingRepeat(elements, 't')).toEqual({ over: 'rows', as: 'row' });
    expect(enclosingRepeat(elements, ROOT_ELEMENT_ID)).toBeNull();
  });
});

describe('generateCode — binding forms', () => {
  it('emits attribute, inverted boolean, and event bindings in place of literals', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['a', 'b']),
      a: text('a', ROOT_ELEMENT_ID, 'Home', { tag: 'a', attributes: { href: 'https://x', target: '_blank' }, bind: { href: 'url' } }),
      b: text('b', ROOT_ELEMENT_ID, 'Go', { tag: 'button', attributes: { type: 'button', disabled: '' }, bind: { disabled: '!canStart' }, on: { onClick: 'onStart' } }),
    };
    const { tsx } = gen(elements);
    // Bound attributes follow the literals, in binding order.
    expect(tsx).toContain('<a data-scamp-id="text_a" className={styles.text_a} target="_blank" href={url}>Home</a>');
    expect(tsx).toContain('<button data-scamp-id="text_b" className={styles.text_b} type="button" disabled={!canStart} onClick={onStart}>Go</button>');
    expect(tsx).toContain('url = "https://x", canStart = false, onStart, className');
    expect(tsx).toContain("export const _scamp = { contract: 2, events: ['onStart'] } as const;");
  });

  it('wraps a repeated instance and a shown element, with the key and row bindings', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['list', 'note'], { samples: { players: [{ id: '1', label: 'A' }], waiting: true } }),
      list: rect('list', ROOT_ELEMENT_ID, { childIds: ['card'], display: 'flex' }),
      card: { ...rect('card', 'list'), type: 'component-instance', componentName: 'LinkCard', instanceId: 'inst_1', repeat: { over: 'players', as: 'player' }, bind: { label: 'player.label' }, childIds: ['copy'] },
      copy: text('copy', 'card', 'Copy', { tag: 'button', attributes: { type: 'button' }, on: { onClick: 'onCopy' } }),
      note: text('note', ROOT_ELEMENT_ID, 'Waiting', { showIf: 'waiting' }),
    };
    const { tsx } = gen(elements);
    expect(tsx).toContain([
      '        {players.map((player) => (',
      '          <LinkCard data-scamp-instance-id="inst_1" key={player.id} label={player.label}>',
      '            <button data-scamp-id="text_copy" className={styles.text_copy} type="button" onClick={() => onCopy?.(player.id)}>Copy</button>',
      '          </LinkCard>',
      '        ))}',
    ].join('\n'));
    expect(tsx).toContain('      {waiting && (\n        <p data-scamp-id="text_note" className={styles.text_note}>Waiting</p>\n      )}');
    expect(tsx).toContain('  players = [\n    { id: "1", label: "A" },\n  ],\n  waiting = true,\n  onCopy,\n  className,\n}: CardProps) {');
    expect(tsx).toContain('players?: Array<{ id: string; label: string }>;');
  });

  it('emits a bound image src and alt as expressions, not as the sample literal', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['i']),
      i: image('i', ROOT_ELEMENT_ID, {
        src: 'https://example.com/sample.png',
        alt: 'A sample',
        bind: { src: 'photo', alt: 'caption' },
      }),
    };
    const line = gen(elements).tsx.split('\n').find((l) => l.includes('<img'));
    expect(line?.trim()).toBe(
      '<img data-scamp-id="img_i" className={styles.img_i} src={photo} alt={caption} />'
    );
  });

  it('quotes an empty alt rather than emitting it bare, which JSX reads as true', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['i']),
      i: image('i', ROOT_ELEMENT_ID, { src: '/hero.png', alt: '' }),
    };
    const line = gen(elements).tsx.split('\n').find((l) => l.includes('<img'));
    expect(line?.trim()).toBe(
      '<img data-scamp-id="img_i" className={styles.img_i} src="/hero.png" alt="" />'
    );
  });

  it('writes a verbatim {expr} attribute back unquoted', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['a']),
      a: text('a', ROOT_ELEMENT_ID, 'x', { tag: 'a', attributes: { href: '{base + path}' } }),
    };
    expect(gen(elements).tsx).toContain('href={base + path}');
  });
});

describe('round trip — one case per binding kind', () => {
  it('keeps a verbatim expression with quotes and spaces whole, not split into attributes', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['c']),
      c: text('c', ROOT_ELEMENT_ID, '', {
        tag: 'input',
        attributes: { type: 'checkbox', defaultChecked: '{tool.on === "true" && ok}' },
      }),
    };
    const { tsx } = gen(elements);
    expect(tsx).toContain('defaultChecked={tool.on === "true" && ok}');
    expect(gen(roundTrip(elements)).tsx).toBe(tsx);
  });

  it('text prop', () => {
    const elements = { [ROOT_ELEMENT_ID]: root(['t']), t: text('t', ROOT_ELEMENT_ID, 'KZQ4', { prop: 'code' }) };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('attribute and inverted boolean attribute', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['a', 'b']),
      a: text('a', ROOT_ELEMENT_ID, 'Home', { tag: 'a', attributes: { href: 'https://x' }, bind: { href: 'url' } }),
      b: text('b', ROOT_ELEMENT_ID, 'Go', { tag: 'button', attributes: { type: 'button', disabled: '' }, bind: { disabled: '!canStart' } }),
    };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('a boolean attribute absent at design time', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['b']),
      b: text('b', ROOT_ELEMENT_ID, 'Go', { tag: 'button', attributes: { type: 'button' }, bind: { disabled: 'isBusy' } }),
    };
    const { tsx } = gen(elements);
    expect(tsx).toContain('disabled={isBusy}');
    expect(tsx).toContain('isBusy = false');
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('event', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['b']),
      b: text('b', ROOT_ELEMENT_ID, 'Go', { tag: 'button', on: { onClick: 'onStart' } }),
    };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('show, with its flag on the root', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['n'], { samples: { waiting: false } }),
      n: text('n', ROOT_ELEMENT_ID, 'Waiting', { showIf: 'waiting' }),
    };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('repeat over rows, with row-bound text, an instance prop, and an in-repeat event', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['list'], { samples: { players: [{ id: '1', label: 'A', n: 1 }, { id: '2', label: 'B', n: 2 }] } }),
      list: rect('list', ROOT_ELEMENT_ID, { childIds: ['card'], display: 'flex' }),
      card: { ...rect('card', 'list'), type: 'component-instance', componentName: 'LinkCard', instanceId: 'inst_card', propOverrides: {}, repeat: { over: 'players', as: 'player' }, bind: { label: 'player.label' }, childIds: ['copy', 'n'] },
      copy: text('copy', 'card', 'Copy', { tag: 'button', attributes: { type: 'button' }, on: { onClick: 'onCopy' } }),
      n: { ...rect('n', 'card'), type: 'text', prop: 'player.n' },
    };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('a repeat keyed on a field other than id keeps the key', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['row'], { samples: { items: [{ slug: 'a' }] } }),
      row: rect('row', ROOT_ELEMENT_ID, { repeat: { over: 'items', as: 'item', key: 'slug' } }),
    };
    expect(gen(elements).tsx).toContain('key={item.slug}');
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('an image src and alt bound to props', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: root(['i']),
      i: image('i', ROOT_ELEMENT_ID, {
        src: 'https://example.com/sample.png',
        alt: 'A sample',
        bind: { src: 'photo', alt: 'caption' },
      }),
    };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('an image src and alt bound to row fields inside a repeat', () => {
    const rows = [
      { id: '1', src: 'https://example.com/one.png', label: 'One' },
      { id: '2', src: 'https://example.com/two.png', label: 'Two' },
    ];
    const elements = {
      [ROOT_ELEMENT_ID]: root(['i'], { samples: { shots: rows } }),
      // No `src` / `alt` of its own: a row-bound attribute's sample is
      // the rows on the root, the same as row-bound text carries no
      // `text`. see docs/notes/view-bindings.md
      i: {
        ...rect('i', ROOT_ELEMENT_ID),
        type: 'image' as const,
        bind: { src: 'shot.src', alt: 'shot.label' },
        repeat: { over: 'shots', as: 'shot' },
      },
    };
    expect(roundTrip(elements)).toEqual(elements);
  });

  it('nested show inside repeat', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: root(['row'], { samples: { items: [{ id: '1' }], extra: true } }),
      row: rect('row', ROOT_ELEMENT_ID, { repeat: { over: 'items', as: 'item' }, childIds: ['n'] }),
      n: text('n', 'row', 'More', { showIf: 'extra' }),
    };
    expect(roundTrip(elements)).toEqual(elements);
  });
});

describe('propsTypeSource', () => {
  it('writes every prop optional in order and className last', () => {
    expect(
      propsTypeSource('CardProps', [
        { name: 'title', kind: 'text', tsType: 'string', defaultValue: 'Hi' },
        { name: 'onOpen', kind: 'event', tsType: '() => void' },
      ])
    ).toBe('type CardProps = {\n  title?: string;\n  onOpen?: () => void;\n  className?: string;\n};');
  });

  it('declares only className when there are no props', () => {
    expect(propsTypeSource('CardProps', [])).toBe('type CardProps = {\n  className?: string;\n};');
  });
});
