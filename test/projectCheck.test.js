import { describe, it, expect } from 'vitest';
import { parseCode } from '@lib/parseCode';
import { checkProject, findCheckTarget } from '@lib/projectCheck';
const TSX = [
    "import styles from './x.module.css';",
    'export default function X() {',
    '  return (',
    '    <div data-scamp-id="root" className={styles.root}>',
    '      <div data-scamp-id="a1b2" className={styles.card_a1b2}></div>',
    '    </div>',
    '  );',
    '}',
].join('\n');
const target = (name, kind, cardColor) => {
    const parsed = parseCode(TSX, `.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  color: ${cardColor};\n}\n`);
    return { name, kind, elements: parsed.elements, rootId: parsed.rootId };
};
const TOKENS = ['--ink'];
describe('checkProject', () => {
    it('checks every target, and lists only the ones with findings, pages first', () => {
        const result = checkProject([
            target('Card', 'component', 'var(--ghost)'),
            target('Lobby', 'view', 'var(--ink)'),
            target('about', 'page', 'var(--missing)'),
        ], TOKENS);
        expect(result.checked).toBe(3);
        expect(result.problems).toBe(2);
        expect(result.withFindings.map((r) => `${r.kind}:${r.name}`)).toEqual(['page:about', 'component:Card']);
        expect(result.withFindings[0]?.findings[0]?.kind).toBe('undeclared-token');
        expect(result.withFindings[0]?.findings[0]?.message).toContain('var(--missing)');
    });
    it('keeps notes apart from problems: a page with only notes is intact', () => {
        // `inline-flex` renders fine; the panel just has no control for it.
        const parsed = parseCode(TSX, '.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  display: inline-flex;\n}\n');
        const result = checkProject([{ name: 'chips', kind: 'page', elements: parsed.elements, rootId: parsed.rootId }], TOKENS);
        expect(result.problems).toBe(0);
        expect(result.notes).toBe(1);
        expect(result.withFindings).toEqual([]);
        expect(result.withNotesOnly[0]?.notes[0]?.kind).toBe('not-panel-editable');
        expect(result.aboutNotes).toContain('Leave them');
    });
    it('reports a clean project as clean, and passes through files that didn’t parse', () => {
        const result = checkProject([target('home', 'page', 'var(--ink)')], TOKENS, ['views/Broken/Broken.tsx']);
        expect(result).toMatchObject({ checked: 1, problems: 0, notes: 0, withFindings: [], withNotesOnly: [], unreadable: ['views/Broken/Broken.tsx'] });
    });
    it('checks nothing in an empty project', () => {
        expect(checkProject([], TOKENS)).toMatchObject({ checked: 0, problems: 0, withFindings: [], unreadable: [] });
    });
});
describe('findCheckTarget', () => {
    const targets = [target('about-us', 'page', 'red'), target('LobbyRoom', 'view', 'red'), target('Card', 'component', 'red')];
    it('finds a plain page by its name, a view by name or route slug, and ignores case last', () => {
        expect(findCheckTarget(targets, 'about-us')?.kind).toBe('page');
        expect(findCheckTarget(targets, 'LobbyRoom')?.name).toBe('LobbyRoom');
        expect(findCheckTarget(targets, 'lobby-room')?.name).toBe('LobbyRoom');
        expect(findCheckTarget(targets, 'card')?.name).toBe('Card');
    });
    it('returns null for a name nothing has', () => {
        expect(findCheckTarget(targets, 'nope')).toBeNull();
        expect(findCheckTarget([], 'about')).toBeNull();
    });
});
