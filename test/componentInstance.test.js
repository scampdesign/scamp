import { describe, it, expect } from 'vitest';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
const makeRoot = (childIds = []) => ({
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
    inlineFragments: [],
});
const makeInstance = (overrides) => ({
    ...DEFAULT_RECT_STYLES,
    type: 'component-instance',
    position: 'static',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    widthMode: 'auto',
    heightMode: 'auto',
    x: 0,
    y: 0,
    customProperties: {},
    inlineFragments: [],
    instanceId: `inst_${overrides.id}`,
    propOverrides: {},
    ...overrides,
});
describe('generateCode — component-instance JSX', () => {
    it('emits the PascalCase tag with data-scamp-instance-id and prop attributes', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
                instanceId: 'inst_a1b2',
                propOverrides: { label: 'Get started' },
            }),
        };
        const { tsx } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        expect(tsx).toContain('<Button data-scamp-instance-id="inst_a1b2" label="Get started" />');
    });
    it('emits the matching @/components/<Name>/<Name> import at the top of the file', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
            }),
        };
        const { tsx } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        expect(tsx).toContain("import Button from '@/components/Button/Button';");
        // Styles import still comes first.
        expect(tsx.indexOf("import styles")).toBeLessThan(tsx.indexOf("import Button"));
    });
    it('dedupes the import line when multiple instances of the same component appear', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2', 'c3d4']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
                instanceId: 'inst_a1b2',
            }),
            c3d4: makeInstance({
                id: 'c3d4',
                componentName: 'Button',
                instanceId: 'inst_c3d4',
            }),
        };
        const { tsx } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        const importCount = tsx.split("import Button from '@/components/Button/Button';").length - 1;
        expect(importCount).toBe(1);
    });
    it('sorts component imports alphabetically for stable round-trips', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2', 'c3d4']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
                instanceId: 'inst_a1b2',
            }),
            c3d4: makeInstance({
                id: 'c3d4',
                componentName: 'AppHeader',
                instanceId: 'inst_c3d4',
            }),
        };
        const { tsx } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        expect(tsx.indexOf('import AppHeader')).toBeLessThan(tsx.indexOf('import Button'));
    });
    it('emits no CSS class block for an instance left at its default size', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
                instanceId: 'inst_a1b2',
            }),
        };
        const { css } = generateCode({
            elements,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        // The page's CSS module has the root block and nothing else. An
        // instance's visual styles live in Button.module.css; the ONLY thing
        // the page can own is the instance's size, and this one has none.
        // see test/instanceSize.test.ts for the sized case.
        expect(css).toContain('.root');
        expect(css).not.toMatch(/\.a1b2\b/);
        expect(css).not.toMatch(/\.inst_a1b2\b/);
        expect(css).not.toMatch(/\.Button\b/);
    });
});
describe('parseCode — component-instance JSX', () => {
    it('recognises a Capitalised tag backed by an @/components/ import as an instance', () => {
        const tsx = `import styles from './page.module.css';
import Button from '@/components/Button/Button';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Button data-scamp-instance-id="inst_a1b2" label="Get started" />
    </div>
  );
}
`;
        const css = `.root {}`;
        const { elements } = parseCode(tsx, css);
        const instance = elements['a1b2'];
        expect(instance).toBeDefined();
        expect(instance.type).toBe('component-instance');
        expect(instance.componentName).toBe('Button');
        expect(instance.instanceId).toBe('inst_a1b2');
        expect(instance.propOverrides).toEqual({ label: 'Get started' });
        expect(instance.missingComponent).toBeUndefined();
    });
    it('flags missingComponent when the tag has no matching @/components/ import', () => {
        const tsx = `import styles from './page.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Button data-scamp-instance-id="inst_a1b2" />
    </div>
  );
}
`;
        const css = `.root {}`;
        const { elements } = parseCode(tsx, css);
        const instance = elements['a1b2'];
        expect(instance).toBeDefined();
        expect(instance.type).toBe('component-instance');
        expect(instance.missingComponent).toBe(true);
    });
    it('parses instances with no prop overrides as an empty map', () => {
        const tsx = `import styles from './page.module.css';
import Card from '@/components/Card/Card';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Card data-scamp-instance-id="inst_a1b2" />
    </div>
  );
}
`;
        const css = `.root {}`;
        const { elements } = parseCode(tsx, css);
        expect(elements['a1b2'].propOverrides).toEqual({});
    });
});
describe('round-trip — generate then parse reproduces the instance', () => {
    it('round-trips an instance with a single prop override', () => {
        const original = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
                instanceId: 'inst_a1b2',
                propOverrides: { label: 'Save changes' },
            }),
        };
        const { tsx, css } = generateCode({
            elements: original,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        const parsed = parseCode(tsx, css);
        const back = parsed.elements['a1b2'];
        expect(back.type).toBe('component-instance');
        expect(back.componentName).toBe('Button');
        expect(back.instanceId).toBe('inst_a1b2');
        expect(back.propOverrides).toEqual({ label: 'Save changes' });
    });
    it('round-trips two instances of the same component with different props', () => {
        const original = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2', 'c3d4']),
            a1b2: makeInstance({
                id: 'a1b2',
                componentName: 'Button',
                instanceId: 'inst_a1b2',
                propOverrides: { label: 'Yes' },
            }),
            c3d4: makeInstance({
                id: 'c3d4',
                componentName: 'Button',
                instanceId: 'inst_c3d4',
                propOverrides: { label: 'No' },
            }),
        };
        const { tsx, css } = generateCode({
            elements: original,
            rootId: ROOT_ELEMENT_ID,
            pageName: 'home',
        });
        const parsed = parseCode(tsx, css);
        expect(parsed.elements['a1b2'].propOverrides).toEqual({ label: 'Yes' });
        expect(parsed.elements['c3d4'].propOverrides).toEqual({ label: 'No' });
    });
});
