import { describe, it, expect } from 'vitest';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { parseScampMeta } from '@lib/parseCode/tsx';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { WRITTEN_CONTRACT } from '@shared/projectConfig';
/**
 * The parts of the scampjs contract-0 file shape that land in phase 1,
 * step 1: the `_scamp` export on components and views, and `color`
 * surviving on a container. The byte-for-byte check against the
 * published fixture is `contract0Drift.test.ts`.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md
 */
const componentTsx = (meta) => `import styles from './Tag.module.css';

type TagProps = {
  label?: string;
  className?: string;
};

export default function Tag({ label = "Round 1", className }: TagProps) {
  return (
    <span data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>{label}</span>
  );
}
${meta}`;
const CSS = `.root {
  width: 100%;
  position: relative;
  display: inline-flex;
}
`;
const roundTrip = (tsx, css, isComponent) => {
    const parsed = parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent });
    return generateCode({
        elements: parsed.elements,
        rootId: parsed.rootId,
        pageName: 'Tag',
        cssModuleImportName: 'Tag',
        breakpoints: DEFAULT_BREAKPOINTS,
        isComponent,
    });
};
describe('parseScampMeta', () => {
    it('reads the contract version and the event props', () => {
        expect(parseScampMeta(`export const _scamp = { contract: 3, events: ['onCopy', 'onStart'] } as const;`)).toEqual({ contract: 3, events: ['onCopy', 'onStart'] });
    });
    it('reads an empty events list', () => {
        expect(parseScampMeta(`export const _scamp = { contract: 0, events: [] } as const;`)).toEqual({
            contract: 0,
            events: [],
        });
    });
    it('tolerates double quotes, extra whitespace, and no trailing semicolon', () => {
        expect(parseScampMeta(`export const _scamp = {\n  contract: 1,\n  events: [ "onX" ]\n} as const`)).toEqual({ contract: 1, events: ['onX'] });
    });
    it('returns null when the file has no _scamp export', () => {
        expect(parseScampMeta(componentTsx(''))).toBeNull();
    });
});
describe('generateCode — the _scamp export', () => {
    const META = `\nexport const _scamp = { contract: ${WRITTEN_CONTRACT}, events: [] } as const;\n`;
    it('ends every component with the export, after a blank line', () => {
        const out = roundTrip(componentTsx(''), CSS, true);
        expect(out.tsx.endsWith(`}\n${META}`)).toBe(true);
    });
    it('writes the export even when the file did not have one', () => {
        const out = roundTrip(componentTsx(''), CSS, true);
        expect(out.tsx).toContain('export const _scamp');
    });
    it('round-trips a component that already carries the export, byte for byte', () => {
        const original = componentTsx(META);
        const out = roundTrip(original, CSS, true);
        expect(out.tsx).toBe(original);
        expect(out.css).toBe(CSS);
    });
    it('does not add the export to a page', () => {
        const pageTsx = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}></div>
  );
}
`;
        const out = roundTrip(pageTsx, `.root {\n}\n`, false);
        expect(out.tsx).not.toContain('_scamp');
    });
});
describe('parseCode — viewMeta', () => {
    it('surfaces the _scamp export on the parsed tree', () => {
        const parsed = parseCode(componentTsx(`export const _scamp = { contract: 0, events: ['onX'] } as const;\n`), CSS, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        expect(parsed.viewMeta).toEqual({ contract: 0, events: ['onX'] });
    });
    it('omits viewMeta when the file has no export', () => {
        const parsed = parseCode(componentTsx(''), CSS, {
            breakpoints: DEFAULT_BREAKPOINTS,
            isComponent: true,
        });
        expect(parsed.viewMeta).toBeUndefined();
    });
    it('does not let the export leak into the element tree as loose text', () => {
        const parsed = parseCode(componentTsx(`export const _scamp = { contract: 0, events: [] } as const;\n`), CSS, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        expect(Object.keys(parsed.elements)).toEqual(['root']);
        expect(parsed.elements['root']?.text).toBe('Round 1');
    });
});
describe('generateCode — color on a container', () => {
    const tsx = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="box_a1" className={styles.box_a1}></div>
    </div>
  );
}
`;
    it('round-trips color on a rectangle instead of dropping it', () => {
        // Canonical order: color sits with the paint group, ahead of position.
        const css = `.root {\n  width: 100%;\n  min-height: 100vh;\n  position: relative;\n}\n\n.box_a1 {\n  color: var(--color-fg);\n  position: absolute;\n  left: 0px;\n  top: 0px;\n}\n`;
        const out = roundTrip(tsx, css, false);
        expect(out.css).toBe(css);
    });
    it('still emits color once on an svg element', () => {
        const svgTsx = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <svg data-scamp-id="icon_a1" className={styles.icon_a1} viewBox="0 0 8 8"><circle r="4" /></svg>
    </div>
  );
}
`;
        const css = `.root {\n  width: 100%;\n  min-height: 100vh;\n  position: relative;\n}\n\n.icon_a1 {\n  position: absolute;\n  left: 0px;\n  top: 0px;\n  color: red;\n}\n`;
        const out = roundTrip(svgTsx, css, false);
        expect(out.css.match(/color: red;/g)).toHaveLength(1);
    });
});
describe('the declared contract survives a save', () => {
    const view = (contract) => `import styles from './Card.module.css';

type CardProps = {
  className?: string;
};

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} />
  );
}

export const _scamp = { contract: ${contract}, events: [] } as const;
`;
    const css = '.root {\n  width: 100%;\n  position: relative;\n}\n';
    const regenerate = (tsx) => {
        const parsed = parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        return generateCode({
            elements: parsed.elements,
            rootId: parsed.rootId,
            pageName: 'Card',
            cssModuleImportName: 'Card',
            breakpoints: DEFAULT_BREAKPOINTS,
            customMediaBlocks: parsed.customMediaBlocks,
            pageKeyframesBlocks: parsed.keyframesBlocks,
            isComponent: true,
        }).tsx;
    };
    it('keeps a contract-0 file at contract 0, byte for byte', () => {
        expect(WRITTEN_CONTRACT).toBe(2);
        const parsed = parseCode(view(0), css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        expect(parsed.elements[parsed.rootId]?.contract).toBe(0);
        expect(regenerate(view(0))).toBe(view(0));
    });
    it('records nothing on the root for a file already at the written contract', () => {
        const parsed = parseCode(view(2), css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        expect(parsed.elements[parsed.rootId]?.contract).toBeUndefined();
        expect(regenerate(view(2))).toBe(view(2));
    });
    it('writes the current contract for a tree that declares none', () => {
        const parsed = parseCode(view(0), css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        const root = parsed.elements[parsed.rootId];
        if (!root)
            throw new Error('no root');
        const { contract: _dropped, ...fresh } = root;
        void _dropped;
        const tsx = generateCode({
            elements: { ...parsed.elements, [parsed.rootId]: fresh },
            rootId: parsed.rootId,
            pageName: 'Card',
            cssModuleImportName: 'Card',
            breakpoints: DEFAULT_BREAKPOINTS,
            customMediaBlocks: parsed.customMediaBlocks,
            pageKeyframesBlocks: parsed.keyframesBlocks,
            isComponent: true,
        }).tsx;
        expect(tsx).toContain('export const _scamp = { contract: 2, events: [] } as const;');
    });
});
