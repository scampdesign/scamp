import { describe, expect, it } from 'vitest';

import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { generateCode } from '@lib/generateCode';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { parseCode } from '@lib/parseCode';

/**
 * A component instance owns two things on the page it sits on: its size,
 * and where the page places it. It carries them as a page CSS class
 * forwarded to the component's root through the `className` prop.
 * see docs/notes/components-data-model.md
 */

const makeRoot = (childIds: string[]): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds,
  widthMode: 'stretch',
  heightMode: 'auto',
  minHeight: '100vh',
  x: 0,
  y: 0,
  backgroundColor: '#ffffff',
  customProperties: {},
});

const makeInstance = (overrides: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: 'c7d7',
  type: 'component-instance',
  position: 'static',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  widthMode: 'auto',
  heightMode: 'auto',
  x: 0,
  y: 0,
  customProperties: {},
  componentName: 'Button',
  instanceId: 'inst_c7d7',
  propOverrides: {},
  ...overrides,
});

const generatePage = (instance: ScampElement): { tsx: string; css: string } =>
  generateCode({
    elements: {
      [ROOT_ELEMENT_ID]: makeRoot([instance.id]),
      [instance.id]: instance,
    },
    rootId: ROOT_ELEMENT_ID,
    pageName: 'profile',
  });

describe('component instance size — generateCode', () => {
  it('emits no rule and no className for an instance left at the default size', () => {
    const { tsx, css } = generatePage(makeInstance());
    expect(tsx).toContain('<Button data-scamp-instance-id="inst_c7d7" />');
    expect(css).not.toContain('inst_c7d7');
  });

  it('emits a doubled selector so the page rule outranks the component root', () => {
    const { css } = generatePage(
      makeInstance({ widthMode: 'fixed', widthValue: 200 })
    );
    expect(css).toContain('.inst_c7d7.inst_c7d7 {\n  width: 200px;\n}');
  });

  it('forwards the page class to the component through the className prop', () => {
    const { tsx } = generatePage(
      makeInstance({ widthMode: 'fixed', widthValue: 200 })
    );
    expect(tsx).toContain(
      '<Button data-scamp-instance-id="inst_c7d7" className={styles.inst_c7d7} />'
    );
  });

  it('emits both axes when width and height are set', () => {
    const { css } = generatePage(
      makeInstance({
        widthMode: 'fixed',
        widthValue: 200,
        heightMode: 'fixed',
        heightValue: 48,
      })
    );
    expect(css).toContain('.inst_c7d7.inst_c7d7 {\n  width: 200px;\n  height: 48px;\n}');
  });

  it('emits a non-px width verbatim from widthCustom', () => {
    const { css } = generatePage(
      makeInstance({ widthMode: 'fixed', widthCustom: 'calc(100% - 2rem)' })
    );
    expect(css).toContain('width: calc(100% - 2rem);');
  });

  it('emits fit-content and stretch modes as their CSS keywords', () => {
    const { css } = generatePage(
      makeInstance({ widthMode: 'fit-content', heightMode: 'stretch' })
    );
    expect(css).toContain('width: fit-content;');
    expect(css).toContain('height: 100%;');
  });

  it('emits no size rule for an instance whose only styling is a prop override', () => {
    const { css } = generatePage(makeInstance({ propOverrides: { label: 'Go' } }));
    expect(css).not.toContain('inst_c7d7');
  });
});

describe('component instance placement', () => {
  // A dropped or dragged instance is `auto` at its x / y: out of the
  // page's flow, like any element the canvas places.
  const placed = (): ScampElement => makeInstance({ position: 'auto', x: 120, y: 80 });

  it('writes the position of an instance the page places', () => {
    const { css } = generatePage(placed());
    expect(css).toContain('.inst_c7d7.inst_c7d7 {\n  position: absolute;\n  left: 120px;\n  top: 80px;\n}');
  });

  it('forwards the class of a placed instance, so its root takes the position', () => {
    const { tsx } = generatePage(placed());
    expect(tsx).toContain('<Button data-scamp-instance-id="inst_c7d7" className={styles.inst_c7d7} />');
  });

  it('writes size and position in one rule', () => {
    const { css } = generatePage(makeInstance({ position: 'auto', x: 10, y: 20, widthMode: 'fixed', widthValue: 200 }));
    expect(css).toContain('.inst_c7d7.inst_c7d7 {\n  width: 200px;\n  position: absolute;\n  left: 10px;\n  top: 20px;\n}');
  });

  it('round-trips a placed instance back to the same place', () => {
    const instance = placed();
    const { tsx, css } = generatePage(instance);
    expect(parseCode(tsx, css).elements['c7d7']).toEqual(instance);
  });

  it('writes no position for an instance its flex parent lays out', () => {
    const { css } = generateCode({
      elements: {
        [ROOT_ELEMENT_ID]: { ...makeRoot(['c7d7']), display: 'flex' },
        c7d7: makeInstance({ position: 'auto', x: 120, y: 80 }),
      },
      rootId: ROOT_ELEMENT_ID,
      pageName: 'profile',
    });
    expect(css).not.toContain('inst_c7d7');
  });

  it('reads an instance the file leaves in the flow as static, and writes it back unchanged', () => {
    const tsx = [
      "import styles from './profile.module.css';",
      "import Button from '@/components/Button/Button';",
      '',
      'export default function Profile() {',
      '  return (',
      '    <div data-scamp-id="root" className={styles.root}>',
      '      <Button data-scamp-instance-id="inst_c7d7" />',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n');
    const css = '.root {\n  width: 100%;\n  min-height: 100vh;\n  position: relative;\n}\n';
    const parsed = parseCode(tsx, css);
    const instance = parsed.elements['c7d7'];
    expect(instance?.position).toBe('static');
    const again = generateCode({ elements: parsed.elements, rootId: ROOT_ELEMENT_ID, pageName: 'profile' });
    expect(again.css).not.toContain('inst_c7d7');
  });
});

describe('component instance size — round-trip', () => {
  it('round-trips a fixed size back onto the instance element', () => {
    const instance = makeInstance({
      widthMode: 'fixed',
      widthValue: 200,
      heightMode: 'fixed',
      heightValue: 48,
    });
    const { tsx, css } = generatePage(instance);
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['c7d7']).toEqual(instance);
  });

  it('round-trips a default-sized instance without inventing a size', () => {
    const instance = makeInstance();
    const { tsx, css } = generatePage(instance);
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['c7d7']).toEqual(instance);
  });

  it('round-trips a sized instance that also carries prop overrides', () => {
    const instance = makeInstance({
      widthMode: 'fixed',
      widthValue: 320,
      propOverrides: { label: 'Edit profile' },
    });
    const { tsx, css } = generatePage(instance);
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['c7d7']).toEqual(instance);
  });

  it('keeps className out of propOverrides so it is not written back as an attribute', () => {
    const { tsx, css } = generatePage(
      makeInstance({ widthMode: 'fixed', widthValue: 200 })
    );
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['c7d7']!.propOverrides).toEqual({});
  });
});

describe('component className passthrough — round-trip', () => {
  const componentElements = {
    [ROOT_ELEMENT_ID]: {
      ...makeRoot(['t1']),
      minHeight: undefined,
      backgroundColor: 'transparent',
    },
    t1: {
      ...DEFAULT_RECT_STYLES,
      id: 't1',
      type: 'text' as const,
      parentId: ROOT_ELEMENT_ID,
      childIds: [],
      x: 0,
      y: 0,
      customProperties: {},
      text: 'Edit profile',
    },
  };

  const generateComponent = (): { tsx: string; css: string } =>
    generateCode({
      elements: componentElements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'Button',
      cssModuleImportName: 'Button',
      isComponent: true,
    });

  it('forwards className onto the root alongside the root class', () => {
    const { tsx } = generateComponent();
    expect(tsx).toContain(
      "<div data-scamp-id=\"root\" className={`${styles.root} ${className ?? ''}`}>"
    );
  });

  it('declares className on the props type even with no text props or slots', () => {
    const { tsx } = generateComponent();
    expect(tsx).toContain('className?: string;');
    expect(tsx).toContain('export default function Button({ className }: ButtonProps)');
  });

  it('regenerates byte-identical output, so the merged className survives a reload', () => {
    const { tsx, css } = generateComponent();
    const parsed = parseCode(tsx, css, { isComponent: true });
    const regen = generateCode({
      elements: parsed.elements,
      rootId: parsed.rootId,
      pageName: 'Button',
      cssModuleImportName: 'Button',
      isComponent: true,
    });
    expect(regen.tsx).toBe(tsx);
    expect(regen.css).toBe(css);
  });

  it('reads the root class through the merged className, not as an empty class', () => {
    const { tsx, css } = generateComponent();
    const parsed = parseCode(tsx, css, { isComponent: true });
    expect(parsed.elements[ROOT_ELEMENT_ID]!.widthMode).toBe('stretch');
    expect(parsed.elements['t1']!.text).toBe('Edit profile');
  });

  it('still parses a component written before the passthrough existed', () => {
    const legacyTsx = `import styles from './Button.module.css';

export default function Button() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_t1" className={styles.text_t1}>Edit profile</p>
    </div>
  );
}
`;
    const legacyCss = '.root {\n  width: 100%;\n}\n\n.text_t1 {\n}\n';
    const parsed = parseCode(legacyTsx, legacyCss, { isComponent: true });
    expect(parsed.elements[ROOT_ELEMENT_ID]!.widthMode).toBe('stretch');
    expect(parsed.elements['t1']!.text).toBe('Edit profile');
  });
});

describe('component instance size — breakpoints', () => {
  const generateResponsive = (
    instance: ScampElement
  ): { tsx: string; css: string } =>
    generateCode({
      elements: {
        [ROOT_ELEMENT_ID]: makeRoot([instance.id]),
        [instance.id]: instance,
      },
      rootId: ROOT_ELEMENT_ID,
      pageName: 'profile',
      breakpoints: DEFAULT_BREAKPOINTS,
    });

  it('emits a per-breakpoint size rule with the same doubled selector', () => {
    const { css } = generateResponsive(
      makeInstance({
        widthMode: 'fixed',
        widthValue: 200,
        breakpointOverrides: { mobile: { widthMode: 'stretch' } },
      })
    );
    expect(css).toContain('@media (max-width: 390px)');
    expect(css).toContain('.inst_c7d7.inst_c7d7 {');
    expect(css).toContain('width: 100%;');
  });

  it('drops non-size overrides, which an instance has nowhere to render', () => {
    // The page owns an instance's size and nothing else, so a stray
    // background in the override must not reach the file — it would
    // round-trip into a property the panel never shows.
    const { css } = generateResponsive(
      makeInstance({
        widthMode: 'fixed',
        widthValue: 200,
        breakpointOverrides: {
          mobile: { widthMode: 'stretch', backgroundColor: '#ff0000' },
        },
      })
    );
    expect(css).not.toContain('#ff0000');
  });

  it('emits no media rule when the override carries nothing about size', () => {
    const { css } = generateResponsive(
      makeInstance({
        widthMode: 'fixed',
        widthValue: 200,
        breakpointOverrides: { mobile: { backgroundColor: '#ff0000' } },
      })
    );
    expect(css).not.toContain('@media');
  });

  it('round-trips a per-breakpoint size back onto the instance', () => {
    const instance = makeInstance({
      widthMode: 'fixed',
      widthValue: 200,
      breakpointOverrides: { mobile: { widthMode: 'stretch' } },
    });
    const { tsx, css } = generateResponsive(instance);
    const parsed = parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS });
    expect(parsed.elements['c7d7']!.breakpointOverrides).toEqual({
      mobile: { widthMode: 'stretch' },
    });
  });
});

describe('component instance size — hand-written files', () => {
  // Agents write these files directly, so the doubled selector has to be
  // readable as a plain size rule rather than preserved as opaque raw CSS.
  const tsx = `import styles from './page.module.css';
import Button from '@/components/Button/Button';

export default function Profile() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Button data-scamp-instance-id="inst_c7d7" className={styles.inst_c7d7} />
    </div>
  );
}
`;

  it('reads a doubled selector as the instance size', () => {
    const css = '.root {\n}\n\n.inst_c7d7.inst_c7d7 {\n  width: 158px;\n  height: 44px;\n}\n';
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['c7d7']).toMatchObject({
      widthMode: 'fixed',
      widthValue: 158,
      heightMode: 'fixed',
      heightValue: 44,
    });
  });

  it('reads a single-class selector too, since a human would write that', () => {
    const css = '.root {\n}\n\n.inst_c7d7 {\n  width: 158px;\n}\n';
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['c7d7']).toMatchObject({
      widthMode: 'fixed',
      widthValue: 158,
    });
  });

  it('normalises a single-class selector to the doubled form on the next save', () => {
    const css = '.root {\n}\n\n.inst_c7d7 {\n  width: 158px;\n}\n';
    const parsed = parseCode(tsx, css);
    const regen = generateCode({
      elements: parsed.elements,
      rootId: parsed.rootId,
      pageName: 'profile',
    });
    expect(regen.css).toContain('.inst_c7d7.inst_c7d7 {');
  });

  it('does not confuse a different class that shares a prefix', () => {
    const css = '.root {\n}\n\n.inst_c7d7.other {\n  width: 158px;\n}\n';
    const parsed = parseCode(tsx, css);
    // `.x.other` is a compound selector we do not model — it must stay raw
    // rather than being read as the instance's own size.
    expect(parsed.elements['c7d7']!.widthMode).toBe('auto');
  });
});
