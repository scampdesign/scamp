import { describe, it, expect } from 'vitest';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { cloneElementSubtree, ROOT_ELEMENT_ID } from '@lib/element';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';

const TSX_BASIC = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="a1b2" className={styles.rect_a1b2}>
        <div data-scamp-id="c3d4" className={styles.rect_c3d4} />
      </div>
    </div>
  );
}
`;

const CSS_BASIC = `.root {
  width: 1440px;
  height: 900px;
  position: relative;
}

.rect_a1b2 {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  padding: 24px;
  width: 400px;
  height: 300px;
  background: #f0f0f0;
  border-radius: 8px;
  border: 1px solid #cccccc;
  position: absolute;
  left: 100px;
  top: 50px;
}

.rect_c3d4 {
  width: 100px;
  height: 100px;
  background: #3b82f6;
  position: absolute;
  left: 12px;
  top: 24px;
}
`;

describe('parseCode — structure', () => {
  it('returns a tree with the expected elements + parent/child links', () => {
    const { elements, rootId } = parseCode(TSX_BASIC, CSS_BASIC);
    expect(rootId).toBe(ROOT_ELEMENT_ID);
    expect(Object.keys(elements).sort()).toEqual(['a1b2', 'c3d4', 'root']);
    expect(elements['root']?.childIds).toEqual(['a1b2']);
    expect(elements['a1b2']?.parentId).toBe(ROOT_ELEMENT_ID);
    expect(elements['a1b2']?.childIds).toEqual(['c3d4']);
    expect(elements['c3d4']?.parentId).toBe('a1b2');
  });

  it('produces an empty root tree when TSX is empty', () => {
    const { elements, rootId } = parseCode('', '');
    expect(rootId).toBe(ROOT_ELEMENT_ID);
    expect(elements[ROOT_ELEMENT_ID]).toBeDefined();
    expect(elements[ROOT_ELEMENT_ID]?.childIds).toEqual([]);
  });
});

describe('parseCode — CSS overlay', () => {
  it('applies non-default values from the CSS file', () => {
    const { elements } = parseCode(TSX_BASIC, CSS_BASIC);
    const a = elements['a1b2'];
    expect(a).toBeDefined();
    expect(a?.display).toBe('flex');
    expect(a?.flexDirection).toBe('column');
    expect(a?.gap).toBe(16);
    expect(a?.alignItems).toBe('center');
    expect(a?.padding).toEqual([24, 24, 24, 24]);
    expect(a?.widthValue).toBe(400);
    expect(a?.heightValue).toBe(300);
    expect(a?.backgroundColor).toBe('#f0f0f0');
    expect(a?.borderRadius).toEqual([8, 8, 8, 8]);
    expect(a?.borderWidth).toEqual([1, 1, 1, 1]);
    expect(a?.borderStyle).toBe('solid');
    expect(a?.borderColor).toBe('#cccccc');
    expect(a?.x).toBe(100);
    expect(a?.y).toBe(50);
  });

  it('falls back to defaults for properties not present in the CSS', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { width: 50px; }`;
    const { elements } = parseCode(tsx, css);
    const a = elements['a1b2'];
    expect(a?.widthValue).toBe(50);
    expect(a?.heightValue).toBe(DEFAULT_RECT_STYLES.heightValue);
    expect(a?.display).toBe(DEFAULT_RECT_STYLES.display);
    expect(a?.gap).toBe(DEFAULT_RECT_STYLES.gap);
  });

  it('switches to stretch mode for width: 100%', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { width: 100%; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.widthMode).toBe('stretch');
  });

  it('captures unmapped properties in customProperties', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { clip-path: circle(50%); will-change: opacity; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.customProperties).toEqual({
      'clip-path': 'circle(50%)',
      'will-change': 'opacity',
    });
  });

  it('routes a parseable box-shadow into the typed boxShadows field', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.boxShadows).toEqual([
      {
        offsetX: 0,
        offsetY: 2,
        blur: 8,
        spread: 0,
        color: 'rgba(0, 0, 0, 0.1)',
        inset: false,
      },
    ]);
    expect(elements['a1b2']?.customProperties).toEqual({});
  });

  it('parses border longhand individually', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { border-width: 3px; border-style: dashed; border-color: red; }`;
    const { elements } = parseCode(tsx, css);
    const a = elements['a1b2'];
    expect(a?.borderWidth).toEqual([3, 3, 3, 3]);
    expect(a?.borderStyle).toBe('dashed');
    expect(a?.borderColor).toBe('red');
  });

  it('parses padding shorthand', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { padding: 4px 8px 12px 16px; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.padding).toEqual([4, 8, 12, 16]);
  });
});

describe('parseCode — width/height inference', () => {
  it('marks width/height as auto when neither is declared', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { background: red; }`;
    const { elements } = parseCode(tsx, css);
    const a = elements['a1b2'];
    expect(a?.widthMode).toBe('auto');
    expect(a?.heightMode).toBe('auto');
  });

  it('keeps explicit width as fixed and infers auto height', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { width: 640px; }`;
    const { elements } = parseCode(tsx, css);
    const a = elements['a1b2'];
    expect(a?.widthMode).toBe('fixed');
    expect(a?.widthValue).toBe(640);
    expect(a?.heightMode).toBe('auto');
  });

  it('handles width: auto / height: auto explicitly written in the file', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { width: auto; height: auto; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.widthMode).toBe('auto');
    expect(elements['a1b2']?.heightMode).toBe('auto');
  });
});

describe('parseCode — semantic HTML tags', () => {
  it('captures an h1 tag for a text element', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <h1 data-scamp-id="t001" className={styles.text_t001}>About</h1>
    </div>`;
    const css = `.text_t001 { font-size: 56px; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t001']?.type).toBe('text');
    expect(elements['t001']?.tag).toBe('h1');
    expect(elements['t001']?.text).toBe('About');
  });

  it('captures a section tag for a rectangle element', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <section data-scamp-id="a1b2" className={styles.rect_a1b2} />
    </div>`;
    const css = `.rect_a1b2 { width: 600px; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.type).toBe('rectangle');
    expect(elements['a1b2']?.tag).toBe('section');
  });

  it('does not store an explicit tag when it matches the type default', () => {
    // div for rect, p for text — these are the implicit defaults so the
    // round-trip stays text-stable when nobody picked a semantic tag.
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="a1b2" className={styles.rect_a1b2} />
      <p data-scamp-id="t001" className={styles.text_t001}>Hi</p>
    </div>`;
    const css = `.rect_a1b2 { width: 100px; height: 100px; } .text_t001 { font-size: 14px; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.tag).toBeUndefined();
    expect(elements['t001']?.tag).toBeUndefined();
  });

  it('treats h2 tag with text_ classname as text', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <h2 data-scamp-id="t002" className={styles.text_t002}>Subtitle</h2>
    </div>`;
    const css = `.text_t002 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t002']?.type).toBe('text');
    expect(elements['t002']?.tag).toBe('h2');
  });
});

describe('parseCode — text element detection', () => {
  it('classifies elements with the text_ className prefix as text, even when written as <div>', () => {
    // Hand-written / agent-written files often use <div> for text
    // elements. The PRD's contract is that the className prefix is the
    // source of truth.
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="t001" className={styles.text_t001}>Hello</div>
    </div>`;
    const css = `.text_t001 { font-size: 14px; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t001']?.type).toBe('text');
    expect(elements['t001']?.text).toBe('Hello');
  });

  it('classifies <p> tags as text even with no className prefix match', () => {
    // Belt-and-braces: tag-name fallback still works for unrecognized
    // class formats.
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="t001" className={styles.weird}>Hello</p>
    </div>`;
    const css = `.weird {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t001']?.type).toBe('text');
  });
});

describe('parseCode — text elements', () => {
  const TSX_TEXT = `<div data-scamp-id="root" className={styles.root}>
    <p data-scamp-id="t001" className={styles.text_t001}>Hello world</p>
  </div>`;
  const CSS_TEXT = `.text_t001 { font-size: 14px; font-weight: 600; color: #222222; text-align: center; position: absolute; left: 0; top: 0; }`;

  it('detects text elements from <p> tags', () => {
    const { elements } = parseCode(TSX_TEXT, CSS_TEXT);
    expect(elements['t001']?.type).toBe('text');
    expect(elements['t001']?.text).toBe('Hello world');
  });

  it('parses text styling', () => {
    const { elements } = parseCode(TSX_TEXT, CSS_TEXT);
    const t = elements['t001'];
    expect(t?.fontSize).toBe('14px');
    expect(t?.fontWeight).toBe(600);
    expect(t?.color).toBe('#222222');
    expect(t?.textAlign).toBe('center');
  });
});

describe('parseCode — root handling', () => {
  it('reads the root frame size from the .root rule', () => {
    const { elements } = parseCode(TSX_BASIC, CSS_BASIC);
    const root = elements[ROOT_ELEMENT_ID];
    expect(root?.widthValue).toBe(1440);
    expect(root?.heightValue).toBe(900);
  });

  it('does not store position fields for the root element', () => {
    const { elements } = parseCode(TSX_BASIC, CSS_BASIC);
    const root = elements[ROOT_ELEMENT_ID];
    expect(root?.x).toBe(0);
    expect(root?.y).toBe(0);
  });

  it('reads flex container properties on the root', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}></div>`;
    const css = `.root {
      width: 1440px;
      height: 900px;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 24px;
      background: #0f0f0f;
    }`;
    const { elements } = parseCode(tsx, css);
    const root = elements[ROOT_ELEMENT_ID];
    expect(root?.display).toBe('flex');
    expect(root?.flexDirection).toBe('column');
    expect(root?.gap).toBe(16);
    expect(root?.alignItems).toBe('center');
    expect(root?.justifyContent).toBe('space-between');
    expect(root?.padding).toEqual([24, 24, 24, 24]);
    expect(root?.backgroundColor).toBe('#0f0f0f');
  });

  it('captures unmapped properties on the root as customProperties', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}></div>`;
    const css = `.root {
      width: 1440px;
      height: 900px;
      position: relative;
      clip-path: inset(2px);
    }`;
    const { elements } = parseCode(tsx, css);
    expect(elements[ROOT_ELEMENT_ID]?.customProperties).toEqual({
      'clip-path': 'inset(2px)',
    });
  });

  it('parses a custom root min-height into the typed field, not customProperties', () => {
    // `min-height` is a typed property: free-form string so `100vh`,
    // `1200px`, `var(--page-min-h)`, `calc(...)` round-trip via
    // `element.minHeight` rather than landing in customProperties.
    const tsx = `<div data-scamp-id="root" className={styles.root}></div>`;
    const css = `.root {
      min-height: 1200px;
    }`;
    const { elements } = parseCode(tsx, css);
    const root = elements[ROOT_ELEMENT_ID];
    expect(root?.minHeight).toBe('1200px');
    expect(root?.customProperties).toEqual({});
  });
});

describe('parseCode — attribute bag', () => {
  it('collects unknown attributes into the attributes bag', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <a data-scamp-id="a001" className={styles.text_a001} href="/about" target="_self">About</a>
    </div>`;
    const css = `.text_a001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a001']?.tag).toBe('a');
    expect(elements['a001']?.attributes).toEqual({
      href: '/about',
      target: '_self',
    });
  });

  it('stores boolean-present attributes as empty strings', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <video data-scamp-id="v001" className={styles.img_v001} src="clip.mp4" controls autoplay muted />
    </div>`;
    const css = `.img_v001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['v001']?.attributes).toEqual({
      src: 'clip.mp4',
      controls: '',
      autoplay: '',
      muted: '',
    });
    // src moves into the bag for non-img media tags.
    expect(elements['v001']?.src).toBeUndefined();
  });

  it('omits the attributes field when there are no extras', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="a1b2" className={styles.rect_a1b2} />
    </div>`;
    const css = `.rect_a1b2 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.attributes).toBeUndefined();
  });

  it('preserves attribute name case (htmlFor, tabIndex)', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <label data-scamp-id="l001" className={styles.text_l001} htmlFor="email" tabIndex="0">Email</label>
    </div>`;
    const css = `.text_l001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['l001']?.attributes).toEqual({
      htmlFor: 'email',
      tabIndex: '0',
    });
  });
});

describe('parseCode — input element type', () => {
  it('recognises the input_ class prefix as the input element type', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <input data-scamp-id="i001" className={styles.input_i001} type="email" />
    </div>`;
    const css = `.input_i001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['i001']?.type).toBe('input');
    expect(elements['i001']?.attributes).toEqual({ type: 'email' });
  });

  it('falls back to input type from the tag name when the class has no prefix', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <textarea data-scamp-id="t001" className={styles.weird} rows="3" />
    </div>`;
    const css = `.weird {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t001']?.type).toBe('input');
    expect(elements['t001']?.tag).toBe('textarea');
  });
});

describe('parseCode — expanded text tag set', () => {
  it('classifies the expanded semantic text tags by tag name', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <pre data-scamp-id="t001" className={styles.text_t001}>code</pre>
      <time data-scamp-id="t002" className={styles.text_t002}>noon</time>
      <figcaption data-scamp-id="t003" className={styles.text_t003}>cap</figcaption>
      <legend data-scamp-id="t004" className={styles.text_t004}>leg</legend>
      <li data-scamp-id="t005" className={styles.text_t005}>item</li>
    </div>`;
    const css = `.text_t001 {} .text_t002 {} .text_t003 {} .text_t004 {} .text_t005 {}`;
    const { elements } = parseCode(tsx, css);
    for (const id of ['t001', 't002', 't003', 't004', 't005']) {
      expect(elements[id]?.type).toBe('text');
    }
    expect(elements['t001']?.tag).toBe('pre');
    expect(elements['t005']?.tag).toBe('li');
  });
});

describe('parseCode + generateCode — UA padding defaults for list tags', () => {
  it('parses a <ul> with no padding declaration as the UA default [0,0,0,40]', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <ul data-scamp-id="list_a001" className={styles.list_a001} />
    </div>`;
    const css = `.list_a001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a001']?.padding).toEqual([0, 0, 0, 40]);
  });

  it('parses an explicit `padding: 0` on a <ul> as [0,0,0,0]', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <ul data-scamp-id="list_a001" className={styles.list_a001} />
    </div>`;
    const css = `.list_a001 { padding: 0px 0px 0px 0px; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a001']?.padding).toEqual([0, 0, 0, 0]);
  });

  it('round-trips `padding: 0` on a <ul> through generate → parse', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <ul data-scamp-id="list_a001" className={styles.list_a001} />
    </div>`;
    const css = `.list_a001 { padding: 0px 0px 0px 0px; }`;
    const parsed = parseCode(tsx, css);
    const regen = generateCode({
      elements: parsed.elements,
      rootId: parsed.rootId,
      pageName: 'home',
    });
    // The generator must emit `padding: 0` since `<ul>`'s default
    // is [0,0,0,40] and the parsed value is [0,0,0,0].
    // Collapsed to 1-value form since all four sides equal.
    expect(regen.css).toContain('padding: 0px;');
    const reparsed = parseCode(regen.tsx, regen.css);
    expect(reparsed.elements['a001']?.padding).toEqual([0, 0, 0, 0]);
  });

  it('round-trips a <ul> with no padding declaration cleanly (no spurious padding line)', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <ul data-scamp-id="list_a001" className={styles.list_a001} />
    </div>`;
    const css = `.list_a001 {}`;
    const parsed = parseCode(tsx, css);
    const regen = generateCode({
      elements: parsed.elements,
      rootId: parsed.rootId,
      pageName: 'home',
    });
    // Default UA padding [0,0,0,40] matches the tag default, so
    // the generator should omit the declaration entirely — file
    // stays text-stable.
    expect(regen.css).not.toMatch(/padding:/);
  });

  it('still omits zero padding on a <div> (the universal default)', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="rect_a001" className={styles.rect_a001} />
    </div>`;
    const css = `.rect_a001 { padding: 0px 0px 0px 0px; }`;
    const parsed = parseCode(tsx, css);
    const regen = generateCode({
      elements: parsed.elements,
      rootId: parsed.rootId,
      pageName: 'home',
    });
    expect(regen.css).not.toMatch(/padding:/);
  });
});

describe('parseCode — ambiguous tag promoted to rectangle when it has children', () => {
  it('flips a custom-prefixed <li> to rectangle when it contains Scamp children', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <ul data-scamp-id="card_list_a001" className={styles.card_list_a001}>
        <li data-scamp-id="card_row_a002" className={styles.card_row_a002}>
          <span data-scamp-id="card_tool_a003" className={styles.card_tool_a003}>Scamp</span>
          <span data-scamp-id="status_yes_a004" className={styles.status_yes_a004}>Yes</span>
        </li>
      </ul>
    </div>`;
    const css = `.card_list_a001 {} .card_row_a002 {} .card_tool_a003 {} .status_yes_a004 {}`;
    const { elements } = parseCode(tsx, css);
    // The <li> has nested <span>s with their own data-scamp-ids, so it
    // must be a rectangle for its children to actually render.
    expect(elements['a002']?.type).toBe('rectangle');
    expect(elements['a002']?.childIds).toEqual(['a003', 'a004']);
    // Leaf <span>s with no children stay as text.
    expect(elements['a003']?.type).toBe('text');
    expect(elements['a004']?.type).toBe('text');
  });

  it('keeps a childless ambiguous tag as text', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <li data-scamp-id="b001" className={styles.bullet_b001}>Just text</li>
    </div>`;
    const css = `.bullet_b001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['b001']?.type).toBe('text');
  });

  it('honors an explicit text_ prefix even when children are present', () => {
    // Edge case: agent wrote `text_` prefix but nested elements anyway.
    // Trust the explicit prefix — the agent picked text on purpose.
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <li data-scamp-id="t001" className={styles.text_t001}>
        <span data-scamp-id="t002" className={styles.text_t002}>nested</span>
      </li>
    </div>`;
    const css = `.text_t001 {} .text_t002 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t001']?.type).toBe('text');
  });
});

describe('parseCode — select options', () => {
  it('collects option children into the selectOptions list', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <select data-scamp-id="s001" className={styles.input_s001}>
        <option value="us">United States</option>
        <option value="ca" selected>Canada</option>
      </select>
    </div>`;
    const css = `.input_s001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['s001']?.selectOptions).toEqual([
      { value: 'us', label: 'United States' },
      { value: 'ca', label: 'Canada', selected: true },
    ]);
    // Options are NOT stored as canvas elements.
    expect(Object.keys(elements).filter((id) => id !== ROOT_ELEMENT_ID && id !== 's001')).toEqual([]);
  });

  it('omits selectOptions when the select has no options', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <select data-scamp-id="s001" className={styles.input_s001} />
    </div>`;
    const css = `.input_s001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['s001']?.selectOptions).toEqual([]);
  });
});

describe('parseCode — svg source', () => {
  it('captures inner svg source verbatim', () => {
    const raw = `
        <circle cx="50" cy="50" r="40" fill="red" />
        <rect x="10" y="10" width="20" height="20" />`;
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <svg data-scamp-id="v001" className={styles.img_v001} viewBox="0 0 100 100">${raw}
      </svg>
    </div>`;
    const css = `.img_v001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['v001']?.tag).toBe('svg');
    expect(elements['v001']?.svgSource).toContain('<circle cx="50" cy="50" r="40" fill="red" />');
    expect(elements['v001']?.svgSource).toContain('<rect x="10" y="10" width="20" height="20" />');
    // The children inside the svg are NOT canvas elements.
    expect(Object.keys(elements).filter((id) => id !== ROOT_ELEMENT_ID && id !== 'v001')).toEqual([]);
    // viewBox is preserved in the attribute bag.
    expect(elements['v001']?.attributes?.['viewBox']).toBe('0 0 100 100');
  });

  it('stores svgSource as null-omit when the svg is self-closing', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <svg data-scamp-id="v001" className={styles.img_v001} />
    </div>`;
    const css = `.img_v001 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['v001']?.svgSource).toBeUndefined();
  });
});

/**
 * Duplicating a named element has to survive the trip to disk, not just
 * look right in the store — the class prefix IS the only place the name
 * is written. see docs/archive/2026-08-11-duplicate-preserves-names-plan.md
 */
describe('parseCode + generateCode — duplicated names survive a round trip', () => {
  it('writes both duplicates as menu_* classes and parses both back as "menu"', () => {
    const source = parseCode(
      `<div data-scamp-id="root" className={styles.root}>
        <nav data-scamp-id="a1b2" className={styles.menu_a1b2} />
      </div>`,
      `.menu_a1b2 { display: flex; gap: 16px; }`
    );
    const original = source.elements['a1b2'];
    expect(original?.name).toBe('menu');

    // Duplicate it the way the store does.
    const clone = cloneElementSubtree(
      source.elements,
      'a1b2',
      ROOT_ELEMENT_ID,
      new Set(Object.keys(source.elements)),
      () => 'c3d4'
    );
    const root = source.elements[ROOT_ELEMENT_ID];
    if (!root || !clone) throw new Error('setup failed');
    const elements = {
      ...source.elements,
      ...clone.cloned,
      [ROOT_ELEMENT_ID]: { ...root, childIds: [...root.childIds, clone.newId] },
    };

    const { tsx, css } = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
    expect(css).toContain('.menu_a1b2');
    expect(css).toContain('.menu_c3d4');
    expect(css).not.toContain('.rect_c3d4');

    const reparsed = parseCode(tsx, css);
    expect(reparsed.elements['a1b2']?.name).toBe('menu');
    expect(reparsed.elements['c3d4']?.name).toBe('menu');
    // Same styles, distinct identities — the whole point of the story.
    expect(reparsed.elements['c3d4']?.gap).toBe(reparsed.elements['a1b2']?.gap);
    expect(reparsed.elements['c3d4']?.id).not.toBe(reparsed.elements['a1b2']?.id);
  });
});

describe('parseCode — fill-height via align-self round trip', () => {
  const TSX = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="row_shell" className={styles.row_shell}>
        <div data-scamp-id="side_bar" className={styles.side_bar}></div>
      </div>
    </div>
  );
}
`;

  it('reads align-self: stretch with no height as fill-height', () => {
    const { elements } = parseCode(
      TSX,
      `.root {
}

.row_shell {
  display: flex;
}

.side_bar {
  width: 287px;
  align-self: stretch;
}
`
    );
    expect(elements['bar']?.heightMode).toBe('stretch');
    expect(elements['bar']?.widthValue).toBe(287);
  });

  it('does not infer fill-height when a height is declared', () => {
    const { elements } = parseCode(
      TSX,
      `.root {
}

.row_shell {
  display: flex;
}

.side_bar {
  height: 200px;
  align-self: stretch;
}
`
    );
    expect(elements['bar']?.heightMode).toBe('fixed');
  });

  it('does not infer fill-height in a column parent', () => {
    const { elements } = parseCode(
      TSX,
      `.root {
}

.row_shell {
  display: flex;
  flex-direction: column;
}

.side_bar {
  align-self: stretch;
}
`
    );
    expect(elements['bar']?.heightMode).toBe('auto');
  });

  it('round-trips a sidebar that fills height beside a fixed width', () => {
    const css = `.root {
}

.row_shell {
  display: flex;
}

.side_bar {
  width: 287px;
  align-self: stretch;
}
`;
    const first = parseCode(TSX, css);
    const code = generateCode({
      elements: first.elements,
      rootId: first.rootId,
      pageName: 'home',
    });
    const second = parseCode(code.tsx, code.css);
    const recode = generateCode({
      elements: second.elements,
      rootId: second.rootId,
      pageName: 'home',
    });
    expect(recode.css).toBe(code.css);
    expect(code.css).toMatch(/\.side_bar[^}]*align-self:\s*stretch/s);
  });
});

describe('parseCode — fill-height via flex: 1 in a column parent', () => {
  const TSX = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="col_shell" className={styles.col_shell}>
        <div data-scamp-id="body_pane" className={styles.body_pane}></div>
      </div>
    </div>
  );
}
`;
  const cssWith = (childDecls: string): string => `.root {
}

.col_shell {
  display: flex;
  flex-direction: column;
}

.body_pane {
${childDecls}
}
`;

  it('reads flex: 1 with no height as fill-height', () => {
    const { elements } = parseCode(TSX, cssWith('  flex: 1;'));
    expect(elements['pane']?.heightMode).toBe('stretch');
    expect(elements['pane']?.customProperties).toEqual({});
  });

  it('expands any other flex spelling into the typed fields, never the mode', () => {
    // Narrow on purpose: only the exact `flex: 1` becomes fill-height.
    // Everything else is a real grow/shrink/basis the panel can edit.
    const { elements } = parseCode(TSX, cssWith('  flex: 1 1 0%;'));
    expect(elements['pane']?.customProperties).toEqual({});
    expect(elements['pane']?.flexGrow).toBe(1);
    expect(elements['pane']?.flexShrink).toBe(1);
    expect(elements['pane']?.flexBasis).toBe('0%');
    expect(elements['pane']?.heightMode).toBe('auto');
  });

  it('does not infer fill-height when a height is declared', () => {
    const { elements } = parseCode(TSX, cssWith('  height: 200px;\n  flex: 1;'));
    expect(elements['pane']?.heightMode).toBe('fixed');
  });

  it('round-trips byte-stably', () => {
    const css = cssWith('  flex: 1;');
    const first = parseCode(TSX, css);
    const code = generateCode({
      elements: first.elements,
      rootId: first.rootId,
      pageName: 'home',
    });
    const second = parseCode(code.tsx, code.css);
    const recode = generateCode({
      elements: second.elements,
      rootId: second.rootId,
      pageName: 'home',
    });
    expect(recode.css).toBe(code.css);
    expect((code.css.match(/flex:\s*1/g) ?? []).length).toBe(1);
  });
});
