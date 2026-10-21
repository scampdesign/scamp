// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from '@store/canvasSlice';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { makeFileChangedHandler } from '../src/renderer/src/syncBridge/externalEdit';
import { makeFlushDebouncedWrite } from '../src/renderer/src/syncBridge/quietReconcile';
/**
 * An agent's edit arriving while the canvas has changes not yet on disk.
 * It used to cancel the pending save and reload the file over the
 * canvas, so the user's change vanished while the indicator said
 * "Saved". Now it hands both to the merge a refused save uses.
 * see docs/audits/2026-10-20-repo-audit.md, finding 1
 */
const TSX_PATH = '/tmp/p/components/Card/Card.tsx';
const CSS_PATH = '/tmp/p/components/Card/Card.module.css';
const tsxWith = (label) => `import styles from './Card.module.css';\n\ntype CardProps = {\n  className?: string;\n};\n\nexport default function Card({ className }: CardProps) {\n  return (\n    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>\n      <p data-scamp-id="text_a1b2" className={styles.text_a1b2}>${label}</p>\n    </div>\n  );\n}\n`;
const CSS = '.root {\n  width: 100%;\n  position: relative;\n}\n\n.text_a1b2 {\n  color: #ff0000;\n}\n';
const makeCtx = (pending, calls) => ({
    lastSerializedTsx: tsxWith('before'),
    lastSerializedCss: CSS,
    writeTimer: pending ? setTimeout(() => { }, 10_000) : null,
    canvasChangedDuringQuiet: false,
    quietWindow: { extend: () => { }, isQuiet: () => false },
    cancelWriteTimer: () => { },
    scheduleQuietResume: () => { },
    onWriteConflict: (_t, conflict, _s, intent) => {
        calls.push({ conflict, intent });
    },
});
const textColor = () => Object.values(useCanvasStore.getState().elements).find((e) => e.id === 'a1b2')?.color;
describe('an external edit while the canvas has unsaved changes', () => {
    beforeEach(() => {
        const parsed = parseCode(tsxWith('before'), CSS, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
        const text = parsed.elements['a1b2'];
        if (text === undefined)
            throw new Error('fixture has no text element');
        useCanvasStore.setState({
            projectPath: '/tmp/p',
            activePage: null,
            activeComponent: { kind: 'component', name: 'Card', tsxPath: TSX_PATH, cssPath: CSS_PATH },
            componentTrees: {},
            breakpoints: DEFAULT_BREAKPOINTS,
            // The user's change, not on disk yet: the text is now blue.
            elements: { ...parsed.elements, a1b2: { ...text, color: '#0000ff' } },
            rootElementId: parsed.rootId,
            pageCustomMediaBlocks: [],
            pageKeyframesBlocks: [],
        });
    });
    it('merges the canvas change with the agent edit, and leaves the canvas as it is', () => {
        const calls = [];
        makeFileChangedHandler(makeCtx(true, calls))({ path: TSX_PATH, tsxContent: tsxWith('after'), cssContent: CSS });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.conflict.actualTsxContent).toContain('after');
        expect(calls[0]?.intent?.baseTsx).toContain('before');
        expect(calls[0]?.intent?.oursCss).toContain('#0000ff');
        expect(textColor()).toBe('#0000ff');
    });
    it('with nothing unsaved, reloads the file as before', () => {
        const calls = [];
        makeFileChangedHandler(makeCtx(false, calls))({ path: TSX_PATH, tsxContent: tsxWith('after'), cssContent: CSS });
        expect(calls).toEqual([]);
        expect(textColor()).toBe('#ff0000');
    });
});
describe('a debounced save that has fired', () => {
    it('leaves no pending timer, so a later external edit reloads instead of merging', () => {
        const ctx = { ...makeCtx(true, []), writeIfDirty: () => { } };
        makeFlushDebouncedWrite(ctx)();
        expect(ctx.writeTimer).toBeNull();
    });
});
