import { describe, it, expect } from 'vitest';
import { replaceSubtreeWithInstancePure } from '@lib/componentInstance';
import { classNameFor } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { describeOverflow, locateExportedClass } from '@lib/overflowReport';
/**
 * The agent's overflow check, after the browser has measured: exported
 * class names back to elements, and findings said as lines to act on.
 * see docs/notes/agent-overflow-check.md
 */
const VIEW_TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="a1b2" className={styles.main_a1b2}>
    <p data-scamp-id="c3d4" className={styles.text_c3d4}>Hi</p>
  </div>
  <div data-scamp-id="e5f6" className={styles.shell_e5f6}></div>
</div>`;
const SHELL_TSX = `<div data-scamp-id="root" className={styles.root}>
  <nav data-scamp-id="f7a8" className={styles.nav_f7a8}></nav>
</div>`;
// The instance as Scamp makes one, so its class is the one the export uses.
const viewElements = replaceSubtreeWithInstancePure(parseCode(VIEW_TSX, '', { isComponent: true }).elements, 'e5f6', 'Shell', 'b9c0');
if (viewElements === null)
    throw new Error('fixture: no instance');
const instanceEl = viewElements['b9c0'];
if (instanceEl === undefined)
    throw new Error('fixture: no instance');
const INSTANCE = classNameFor(instanceEl);
const view = { name: 'Settings', kind: 'view', elements: viewElements };
const components = { Shell: { elements: parseCode(SHELL_TSX, '', { isComponent: true }).elements } };
describe('locateExportedClass', () => {
    it('finds an element on the view by its class', () => {
        expect(locateExportedClass('main_a1b2', view, components)).toMatchObject({
            owner: 'Settings',
            ownerKind: 'view',
            element: { id: 'a1b2' },
            instance: null,
        });
    });
    it('follows an instance into its component', () => {
        expect(locateExportedClass(`${INSTANCE}__nav_f7a8`, view, components)).toMatchObject({
            owner: 'Shell',
            ownerKind: 'component',
            element: { id: 'f7a8' },
            instance: INSTANCE,
        });
    });
    it('returns null for a class it can’t place', () => {
        expect(locateExportedClass('nowhere_0000', view, components)).toBeNull();
        expect(locateExportedClass('main_a1b2__nav_f7a8', view, components)).toBeNull();
        expect(locateExportedClass(`${INSTANCE}__nowhere_0000`, view, {})).toBeNull();
        expect(locateExportedClass('', view, components)).toBeNull();
    });
});
const finding = (over) => ({
    kind: 'off-page',
    cls: 'main_a1b2',
    parentCls: null,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 100,
    height: 20,
    position: 'static',
    overflow: 'visible',
    whiteSpace: 'normal',
    count: 1,
    ...over,
});
const report = (findings, over = {}) => ({
    viewportWidth: 1440,
    pageWidth: 1440,
    pageHeight: 900,
    findings,
    more: 0,
    ...over,
});
const locate = (cls) => locateExportedClass(cls, view, components);
describe('describeOverflow', () => {
    it('says plainly when nothing overflows', () => {
        expect(describeOverflow('Settings', report([]), locate)).toBe('Rendered Settings at 1440px wide, as its HTML export lays out. The page is 1440×900px.\nNothing overflows.');
    });
    it('says how much wider the page is than the window', () => {
        const text = describeOverflow('Settings', report([finding({ right: 172, width: 1612 })], { pageWidth: 1612 }), locate);
        expect(text).toContain('172px wider than the window');
        expect(text).toContain('- main_a1b2 (id a1b2): 172px past the right of the page');
        expect(text).toContain('1612×20px, position: static');
    });
    it('names the component to fix for an element inside an instance', () => {
        const text = describeOverflow('Settings', report([finding({ kind: 'outside-parent', cls: `${INSTANCE}__nav_f7a8`, parentCls: `${INSTANCE}__root`, right: 24 })]), locate);
        expect(text).toContain(`nav_f7a8 (id f7a8) in the component Shell (instance ${INSTANCE}): 24px past the right of its parent`);
        expect(text).toContain('which lets it show (overflow: visible)');
    });
    it('tells clipped, scrolled and spilling text apart, and counts rows', () => {
        const text = describeOverflow('Settings', report([
            finding({ kind: 'clipped', cls: 'text_c3d4', parentCls: 'main_a1b2', bottom: 30, overflow: 'hidden' }),
            finding({ kind: 'scrolls', cls: 'text_c3d4', parentCls: 'main_a1b2', bottom: 200, overflow: 'auto', count: 12 }),
            finding({ kind: 'text-spills', cls: 'text_c3d4', right: 40, whiteSpace: 'nowrap' }),
        ]), locate);
        expect(text).toContain('which cuts it off (overflow: hidden)');
        expect(text).toContain('(12 elements, the largest given)');
        expect(text).toContain('often intended');
        expect(text).toContain('its text runs 40px past its box (white-space: nowrap)');
    });
    it('keeps an unplaceable class as it was, and says how many were left out', () => {
        const text = describeOverflow('Settings', report([finding({ cls: 'mystery', top: 83 })], { more: 3 }), locate);
        expect(text).toContain('4 overflow findings');
        expect(text).toContain('- mystery: 83px past the top of the page');
        expect(text).toContain('…and 3 smaller ones.');
    });
});
