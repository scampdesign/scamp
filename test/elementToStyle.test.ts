import { describe, it, expect } from 'vitest';

import {
  elementToStyle,
  canvasRenderTag,
  CANVAS_SKIP_ATTRS_BY_TAG,
} from '@lib/elementToStyle';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type FlexDirection, type ScampElement } from '@lib/element';
import type { ThemeToken } from '@shared/types';

const makeEl = (overrides: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: 'rect_a1b2',
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  minHeight: '100vh',
  customProperties: {},
  ...overrides,
});

type StyleOpts = {
  parentDisplay?: 'flex' | 'grid' | 'none' | undefined;
  parentDirection?: FlexDirection | undefined;
  tokens?: ReadonlyArray<ThemeToken>;
  isInstanceInner?: boolean;
  rootMinHeight?: number;
  inComponentEditor?: boolean;
};

const style = (el: ScampElement, o: StyleOpts = {}): Record<string, unknown> =>
  elementToStyle(
    el,
    o.parentDisplay,
    o.parentDirection,
    o.tokens ?? [],
    null,
    'nextjs',
    o.isInstanceInner ?? false,
    o.rootMinHeight ?? 900,
    o.inComponentEditor ?? false
  ) as Record<string, unknown>;

describe('canvasRenderTag', () => {
  it('swaps dialog and svg for div (a real one would interfere with the canvas)', () => {
    expect(canvasRenderTag('dialog')).toBe('div');
    expect(canvasRenderTag('svg')).toBe('div');
  });

  it('passes every other tag through unchanged', () => {
    expect(canvasRenderTag('div')).toBe('div');
    expect(canvasRenderTag('span')).toBe('span');
    expect(canvasRenderTag('button')).toBe('button');
  });
});

describe('position', () => {
  it('renders an explicit position keyword as written', () => {
    expect(style(makeEl({ position: 'fixed', x: 40, y: 60 })).position).toBe('fixed');
    expect(style(makeEl({ position: 'relative' })).position).toBe('relative');
  });

  it('falls back to the tree-shape default when position is auto', () => {
    expect(style(makeEl({ position: 'auto' })).position).toBe('absolute');
    expect(style(makeEl({ position: 'auto' }), { parentDisplay: 'flex' }).position).toBe(
      'relative'
    );
  });

  // A real `position: sticky` sticks to the CANVAS viewport, not the page
  // frame, so it drifts as you pan and reads x/y as stick offsets rather
  // than coordinates. see docs/notes/canvas-sticky-position.md
  it('renders sticky at rest — absolute at its stored coordinates outside a layout parent', () => {
    const s = style(makeEl({ position: 'sticky', x: 40, y: 240 }));
    expect(s.position).toBe('absolute');
    expect(s.left).toBe(40);
    expect(s.top).toBe(240);
  });

  it('renders a sticky flex child in flow, with no offsets to nudge it off its slot', () => {
    const s = style(makeEl({ position: 'sticky', x: 40, y: 240 }), {
      parentDisplay: 'flex',
      parentDirection: 'row',
    });
    expect(s.position).toBe('relative');
    expect(s.left).toBeUndefined();
    expect(s.top).toBeUndefined();
  });

  it('renders a sticky root as relative, matching an auto root', () => {
    const s = style(makeEl({ id: ROOT_ELEMENT_ID, position: 'sticky', x: 0, y: 0 }));
    expect(s.position).toBe('relative');
    expect(s.left).toBeUndefined();
    expect(s.top).toBeUndefined();
  });

  // `static` and `auto` are the two values that let the parent place the
  // element, so they are the only ones whose offsets get dropped — and
  // only where a parent is actually doing the placing. Sticky joins them
  // by being mapped to `auto`.
  it('drops offsets for static only inside a layout parent', () => {
    const loose = style(makeEl({ position: 'static', x: 40, y: 60 }));
    expect(loose.position).toBe('static');
    expect(loose.left).toBe(40);

    const inFlex = style(makeEl({ position: 'static', x: 40, y: 60 }), {
      parentDisplay: 'flex',
    });
    expect(inFlex.left).toBeUndefined();
    expect(inFlex.top).toBeUndefined();
  });

  it('keeps offsets for fixed even inside a layout parent', () => {
    const s = style(makeEl({ position: 'fixed', x: 40, y: 60 }), {
      parentDisplay: 'flex',
    });
    expect(s.left).toBe(40);
    expect(s.top).toBe(60);
  });
});

describe('CANVAS_SKIP_ATTRS_BY_TAG', () => {
  it('skips the side-effecting attributes per tag', () => {
    expect(CANVAS_SKIP_ATTRS_BY_TAG.a?.has('href')).toBe(true);
    expect(CANVAS_SKIP_ATTRS_BY_TAG.a?.has('target')).toBe(true);
    expect(CANVAS_SKIP_ATTRS_BY_TAG.dialog?.has('open')).toBe(true);
    expect(CANVAS_SKIP_ATTRS_BY_TAG.form?.has('action')).toBe(true);
    expect(CANVAS_SKIP_ATTRS_BY_TAG.button?.has('type')).toBe(true);
  });

  it('has no entry for tags without side effects', () => {
    expect(CANVAS_SKIP_ATTRS_BY_TAG.div).toBeUndefined();
  });
});

describe('elementToStyle — width/height modes', () => {
  it('fixed mode uses the numeric value (React appends px)', () => {
    expect(style(makeEl({ widthMode: 'fixed', widthValue: 120 })).width).toBe(
      120
    );
    expect(
      style(makeEl({ heightMode: 'fixed', heightValue: 64 })).height
    ).toBe(64);
  });

  it('a verbatim widthCustom wins over the px fallback in fixed mode', () => {
    expect(
      style(makeEl({ widthMode: 'fixed', widthCustom: '50vh' })).width
    ).toBe('50vh');
  });

  it('stretch maps to 100% outside a flex parent', () => {
    expect(style(makeEl({ widthMode: 'stretch' })).width).toBe('100%');
  });

  it('fit-content maps to the keyword', () => {
    expect(style(makeEl({ widthMode: 'fit-content' })).width).toBe(
      'fit-content'
    );
  });

  it('auto produces undefined so the element inherits the browser default', () => {
    expect(style(makeEl({ widthMode: 'auto' })).width).toBeUndefined();
  });
});

describe('elementToStyle — component-editor root vs. the canvas (viewport resize)', () => {
  const rootEl = (overrides: Partial<ScampElement> = {}): ScampElement =>
    makeEl({ id: ROOT_ELEMENT_ID, parentId: null, ...overrides });

  it('a non-fixed root fills the canvas via min-height and drops its own height', () => {
    const s = style(rootEl({ heightMode: 'auto' }), {
      rootMinHeight: 800,
      inComponentEditor: true,
    });
    expect(s.height).toBeUndefined();
    expect(s.minHeight).toBe('800px');
  });

  it('a stretch root still reflows — min-height tracks the canvas', () => {
    expect(
      style(rootEl({ heightMode: 'stretch' }), {
        rootMinHeight: 400,
        inComponentEditor: true,
      }).minHeight
    ).toBe('400px');
    expect(
      style(rootEl({ heightMode: 'stretch' }), {
        rootMinHeight: 700,
        inComponentEditor: true,
      }).minHeight
    ).toBe('700px');
  });

  it('a fixed-height root keeps its own height and gets no canvas min-height', () => {
    const s = style(rootEl({ heightMode: 'fixed', heightValue: 200 }), {
      rootMinHeight: 800,
      inComponentEditor: true,
    });
    expect(s.height).toBe(200);
    expect(s.minHeight).toBeUndefined();
  });

  it('a fixed-height root does NOT grow when the canvas (rootMinHeight) grows', () => {
    const small = style(rootEl({ heightMode: 'fixed', heightValue: 200 }), {
      rootMinHeight: 300,
      inComponentEditor: true,
    });
    const large = style(rootEl({ heightMode: 'fixed', heightValue: 200 }), {
      rootMinHeight: 900,
      inComponentEditor: true,
    });
    expect(small.height).toBe(200);
    expect(large.height).toBe(200);
    expect(small.minHeight).toBeUndefined();
    expect(large.minHeight).toBeUndefined();
  });

  it('but on the PAGE (not the component editor) a fixed-height root still grows via min-height', () => {
    const s = style(rootEl({ heightMode: 'fixed', heightValue: 200 }), {
      rootMinHeight: 800,
      inComponentEditor: false,
    });
    expect(s.height).toBeUndefined();
    expect(s.minHeight).toBe('800px');
  });
});

describe('elementToStyle — flex parent stretch routing', () => {
  it('main-axis stretch in a row parent keeps width:100% rather than flex:1', () => {
    // `flex: 1` is `flex: 1 1 0%` — basis ZERO — while the generated CSS
    // says `width: 100%`, which is basis 100%. They agree only when the item
    // has no siblings; with a sized sibling the basis-0 item can only grow
    // into the leftovers instead of shrinking proportionally, which showed
    // up as a hero squeezed to half width and pushed right on the canvas
    // while the preview looked fine.
    // see docs/notes/canvas-flex-main-axis-stretch.md
    const s = style(makeEl({ widthMode: 'stretch' }), {
      parentDisplay: 'flex',
      parentDirection: 'row',
    });
    expect(s.width).toBe('100%');
    expect(s.minWidth).toBe(0);
    expect(s.flex).toBeUndefined();
  });

  it('main-axis height stretch in a column parent keeps height:100%', () => {
    const s = style(makeEl({ heightMode: 'stretch' }), {
      parentDisplay: 'flex',
      parentDirection: 'column',
    });
    expect(s.height).toBe('100%');
    expect(s.minHeight).toBe(0);
    expect(s.flex).toBeUndefined();
  });

  it('cross-axis (block) stretch in a row parent becomes align-self:stretch', () => {
    // Cross axis of a row is the BLOCK axis (height); `height: 100%`
    // collapses against an indefinite container height, so we fall back
    // to align-self:stretch.
    const s = style(makeEl({ heightMode: 'stretch' }), {
      parentDisplay: 'flex',
      parentDirection: 'row',
    });
    expect(s.alignSelf).toBe('stretch');
    expect(s.height).toBeUndefined();
  });

  it('cross-axis (inline) stretch in a column parent keeps width:100% and does NOT set align-self', () => {
    // Cross axis of a column is the INLINE axis (width); `width: 100%`
    // resolves against the definite container width. Keeping it (rather
    // than align-self:stretch) lets the parent's align-items position the
    // item — e.g. `align-items: center` + a child `max-width` centres it,
    // matching the browser/preview. Regression for the html-test feed
    // rendering left-aligned on the canvas while centred in the preview.
    const s = style(makeEl({ widthMode: 'stretch' }), {
      parentDisplay: 'flex',
      parentDirection: 'column',
    });
    expect(s.width).toBe('100%');
    expect(s.alignSelf).toBeUndefined();
  });
});

describe('elementToStyle — root vs instance-inner', () => {
  it('the page root renders without a fixed height (it grows via min-height)', () => {
    const rootEl = makeEl({ id: ROOT_ELEMENT_ID, heightMode: 'fixed', heightValue: 300 });
    expect(style(rootEl).height).toBeUndefined();
  });

  it('a non-root element keeps its fixed height', () => {
    const el = makeEl({ heightMode: 'fixed', heightValue: 300 });
    expect(style(el).height).toBe(300);
  });

  it('the same root id rendered as an instance-inner subtree is NOT treated as root', () => {
    const rootEl = makeEl({ id: ROOT_ELEMENT_ID, heightMode: 'fixed', heightValue: 300 });
    expect(style(rootEl, { isInstanceInner: true }).height).toBe(300);
  });
});

describe('elementToStyle — theme token resolution', () => {
  // The two font-family token tests that lived here are gone with the
  // typography peel: the canvas no longer resolves `var(--font-sans)`
  // itself, the browser resolves it natively in the injected stylesheet.
  // That path is covered end to end by the `typography` parity fixture,
  // which asserts computed `font-family` matches the browser's.
  // see docs/notes/canvas-inline-layer-peel.md

  it('still resolves a colour token, which the canvas does resolve', () => {
    const el = makeEl({ backgroundColor: 'var(--brand)' });
    expect(
      style(el, {
        tokens: [{ name: '--brand', value: '#ff0000' }] as never,
      }).backgroundColor
    ).toBe('#ff0000');
  });

  it('follows a semantic → primitive → hex chain for a colour property', () => {
    const tokens: ReadonlyArray<ThemeToken> = [
      { name: '--color-brand', value: 'var(--color-brand-500)' },
      { name: '--color-brand-500', value: 'var(--color-blue-500)' },
      { name: '--color-blue-500', value: '#3b82f6' },
    ];
    const el = makeEl({ backgroundColor: 'var(--color-brand)' });
    expect(style(el, { tokens }).backgroundColor).toBe('#3b82f6');
  });

  it('writes no inline background for the default transparent', () => {
    // Inline beats every stylesheet rule, so an inline `transparent`
    // hid a table's derived stripe on the canvas while the preview
    // showed it.
    const style0 = style(makeEl({ backgroundColor: 'transparent' }), {});
    expect(style0).not.toHaveProperty('backgroundColor');
    expect(style0).not.toHaveProperty('background');
  });

  it('renders a broken colour reference as transparent, not the raw var', () => {
    const tokens: ReadonlyArray<ThemeToken> = [
      { name: '--color-brand-500', value: '#3b82f6' },
    ];
    const el = makeEl({ backgroundColor: 'var(--color-gone)' });
    expect(style(el, { tokens }).backgroundColor).toBe('transparent');
  });
});

describe('elementToStyle — typed text property wins over customProperties echo', () => {
  const makeText = (overrides: Partial<ScampElement> = {}): ScampElement =>
    makeEl({ type: 'text', text: 'Hello', ...overrides });

  it('writes no font-weight inline, and still drops the stale echo', () => {
    // Typography now comes from the injected stylesheet, so the typed
    // value is deliberately absent here. The echo must STILL be filtered —
    // an inline `font-weight: bold` would beat the stylesheet and
    // reintroduce the font-weight-not-updating bug from the other side.
    // see docs/notes/canvas-inline-layer-peel.md
    const el = makeText({
      fontWeight: 700,
      customProperties: { 'font-weight': 'bold' },
    });
    expect(style(el).fontWeight).toBeUndefined();
  });

  it('drops every typed typography echo when its field is set', () => {
    // None of these may reach the inline layer: the typed value belongs to
    // the stylesheet now, and the echo would outrank it if written here.
    const el = makeText({
      fontSize: '24px',
      fontFamily: 'Inter',
      color: '#111111',
      lineHeight: '1.5',
      letterSpacing: '0.02em',
      textAlign: 'center',
      customProperties: {
        'font-size': '12px',
        'font-family': 'Comic Sans',
        color: 'red',
        'line-height': '3',
        'letter-spacing': '1px',
        'text-align': 'left',
      },
    });
    const s = style(el);
    expect(s.fontSize).toBeUndefined();
    expect(s.fontFamily).toBeUndefined();
    expect(s.color).toBeUndefined();
    expect(s.lineHeight).toBeUndefined();
    expect(s.letterSpacing).toBeUndefined();
    expect(s.textAlign).toBeUndefined();
  });

  it('still renders a customProperties font-weight echo when no typed weight is set', () => {
    // Relative keywords (`lighter`/`bolder`) legitimately live in
    // customProperties; with no typed weight, the echo must still render.
    const el = makeText({
      fontWeight: undefined,
      customProperties: { 'font-weight': 'lighter' },
    });
    expect(style(el).fontWeight).toBe('lighter');
  });

  it('does not strip a colour echo on a non-text element', () => {
    // The typed-wins rule is text-only; a rectangle with a custom
    // `color` (e.g. for currentColor descendants) keeps rendering it.
    const el = makeEl({
      type: 'rectangle',
      customProperties: { color: 'red' },
    });
    expect(style(el).color).toBe('red');
  });

  it('keeps the echo when the typography group is toggled off', () => {
    // Typography off → base does not emit the typed field, so the echo
    // is what should render (matches the generator's commented output).
    const el = makeText({
      fontWeight: 700,
      toggledOffGroups: ['typography'],
      customProperties: { 'font-weight': 'bold' },
    });
    expect(style(el).fontWeight).toBe('bold');
  });
});

describe('elementToStyle — background values', () => {
  it('puts a plain colour on background-color', () => {
    const s = style(makeEl({ backgroundColor: '#ff0000' }));
    expect(s.backgroundColor).toBe('#ff0000');
    expect(s.backgroundImage).toBeUndefined();
  });

  it('puts a gradient on background-image, where it is actually valid', () => {
    // Regression: the canvas put every value on `background-color`, and
    // `background-color: radial-gradient(…)` is invalid CSS — the browser
    // drops it, so the glow rendered in the preview and not on the canvas.
    // see docs/notes/canvas-gradient-backgrounds.md
    const gradient = 'radial-gradient(circle, rgba(160,140,255,.2) 0%, rgba(7,6,15,0) 70%)';
    const s = style(makeEl({ backgroundColor: gradient }));
    expect(s.backgroundImage).toBe(gradient);
    expect(s.backgroundColor).toBeUndefined();
  });

  it('keeps a positioned image value on the shorthand', () => {
    const s = style(makeEl({ backgroundColor: 'url(/a.png) center / cover' }));
    expect(s.background).toBe('url(/a.png) center / cover');
  });

  it('emits no background at all when the group is toggled off', () => {
    const s = style(
      makeEl({
        backgroundColor: 'linear-gradient(red, blue)',
        toggledOffGroups: ['background'],
      })
    );
    expect(s.backgroundImage).toBeUndefined();
    expect(s.backgroundColor).toBeUndefined();
    expect(s.background).toBeUndefined();
  });
});

describe('flex child — align-self and the reverse directions (flex-controls plan)', () => {
  it('fills the cross axis with align-self: stretch only while alignSelf is unset', () => {
    const unset = style(makeEl({ heightMode: 'stretch', alignSelf: 'auto' }), {
      parentDisplay: 'flex',
      parentDirection: 'row',
    });
    expect(unset['alignSelf']).toBe('stretch');
    expect(unset['height']).toBeUndefined();
  });

  it('lets a user-set align-self win, as the generated CSS does', () => {
    // The generator writes `height: 100%` + `align-self: center` here; an
    // inline `stretch` would have overridden the stylesheet's `center`.
    const centred = style(makeEl({ heightMode: 'stretch', alignSelf: 'center' }), {
      parentDisplay: 'flex',
      parentDirection: 'row',
    });
    expect(centred['alignSelf']).toBeUndefined();
    expect(centred['height']).toBe('100%');
  });

  it('treats row-reverse as a horizontal main axis', () => {
    const s = style(makeEl({ widthMode: 'stretch' }), {
      parentDisplay: 'flex',
      parentDirection: 'row-reverse',
    });
    expect(s['minWidth']).toBe(0);
    expect(s['minHeight']).toBeUndefined();
  });

  it('treats column-reverse as a vertical main axis', () => {
    const s = style(makeEl({ heightMode: 'stretch' }), {
      parentDisplay: 'flex',
      parentDirection: 'column-reverse',
    });
    expect(s['minHeight']).toBe(0);
    expect(s['alignSelf']).toBeUndefined();
    expect(s['height']).toBe('100%');
  });

  it('applies a grid child’s align-self inline unless it is auto', () => {
    expect(style(makeEl({ alignSelf: 'auto' }), { parentDisplay: 'grid' })['alignSelf']).toBeUndefined();
    expect(style(makeEl({ alignSelf: 'end' }), { parentDisplay: 'grid' })['alignSelf']).toBe('end');
  });
});
