import { describe, it, expect } from 'vitest';
import { AGENT_MD_CONTENT, AGENT_MD_CONTENT_LEGACY, AGENT_MD_CONTENT_SCAMP, findGuidanceSection, guidanceSections, } from '@shared/agentMd';
import { DEFAULT_THEME_CSS } from '@shared/templates';
import { parseCode } from '@lib/parseCode';
import { lintView } from '@lib/viewLint';
/**
 * agent.md's Tables section is instructions an agent copies. Its CSS
 * examples are checked against the parser here, so the document can't
 * promise a rule Scamp then reads as something else.
 * see docs/plans/tables-plan.md
 */
const VARIANTS = [
    ['legacy', AGENT_MD_CONTENT_LEGACY],
    ['nextjs', AGENT_MD_CONTENT],
    ['scamp', AGENT_MD_CONTENT_SCAMP],
];
const TSX = `<div data-scamp-id="root" className={styles.root}>
  <table data-scamp-id="a1b2" className={styles.patients_a1b2}>
    <thead data-scamp-id="a1b3" className={styles.rect_a1b3}>
      <tr data-scamp-id="a1b4" className={styles.rect_a1b4}>
        <th data-scamp-id="a1b5" className={styles.text_a1b5}>Name</th>
      </tr>
    </thead>
    <tbody data-scamp-id="a1b6" className={styles.rect_a1b6}>
      <tr data-scamp-id="a1b7" className={styles.rect_a1b7}>
        <td data-scamp-id="a1b8" className={styles.text_a1b8}>Smith</td>
      </tr>
    </tbody>
  </table>
</div>`;
/** Every ```css block in a section, joined. */
const cssBlocksOf = (section) => [...section.matchAll(/```css\n([\s\S]*?)```/g)].map((m) => m[1] ?? '').join('\n');
describe.each(VARIANTS)('agent.md (%s): Tables', (_name, md) => {
    const section = findGuidanceSection(md, 'Tables');
    it('is a section scamp_get_conventions can hand out', () => {
        expect(section).not.toBeNull();
    });
    it('documents styling rules Scamp reads back as typed table settings', () => {
        const css = cssBlocksOf(section?.body ?? '');
        const parsed = parseCode(TSX, css);
        const table = parsed.elements['a1b2'];
        expect(table?.display).toBe('grid');
        expect(table?.gridTemplateColumns).toBe('2fr 120px 100px');
        expect(table?.tableStyle).toEqual({
            cellPadding: [8, 12, 8, 12],
            cellAlign: 'left',
            rowDivider: { width: 1, style: 'solid', color: 'var(--color-border)' },
            stripe: 'var(--color-neutral-50)',
            stickyHeader: true,
        });
        // Nothing fell back to a raw block the panel can't edit.
        expect(table?.customSelectorBlocks).toBeUndefined();
    });
    it('only uses tokens a new project declares', () => {
        // An agent copies the example. An undeclared token resolves to
        // nothing and is the most common thing an agent gets wrong.
        const css = cssBlocksOf(section?.body ?? '');
        const parsed = parseCode(TSX, css);
        const findings = lintView({
            elements: parsed.elements,
            rootId: 'root',
            themeTokens: ['--color-border', '--color-neutral-50'],
        });
        expect(findings.filter((f) => f.kind === 'undeclared-token')).toEqual([]);
    });
    it('no longer forbids table layout outright', () => {
        expect(md).not.toContain('no table layout');
    });
    it('lists the table tags among the tags Scamp reads', () => {
        const tags = findGuidanceSection(md, 'HTML tags')?.body ?? '';
        for (const tag of ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption']) {
            expect(tags).toContain(`\`${tag}\``);
        }
    });
});
describe.each(VARIANTS)('agent.md (%s): every example token', (_name, md) => {
    it('is declared by a new project, or in the same section', () => {
        // Agents copy examples verbatim, and an undeclared token renders as
        // nothing — the failure the Checks section reports most. A section
        // that wants a token a new project lacks has to show declaring it.
        const declared = new Set([...DEFAULT_THEME_CSS.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
        const undeclared = [];
        for (const section of guidanceSections(md)) {
            const css = cssBlocksOf(section.body);
            const local = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
            for (const match of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
                const name = match[1] ?? '';
                if (!declared.has(name) && !local.has(name))
                    undeclared.push(`${section.title}: ${name}`);
            }
        }
        expect(undeclared).toEqual([]);
    });
});
