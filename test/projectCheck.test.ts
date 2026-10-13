import { describe, it, expect } from 'vitest';

import { parseCode } from '@lib/parseCode';
import { checkProject, findCheckTarget, type CheckTarget, type CheckTargetKind } from '@lib/projectCheck';

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

const target = (name: string, kind: CheckTargetKind, cardColor: string): CheckTarget => {
  const parsed = parseCode(TSX, `.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  color: ${cardColor};\n}\n`);
  return { name, kind, elements: parsed.elements, rootId: parsed.rootId };
};

const TOKENS = ['--ink'];

describe('checkProject', () => {
  it('checks every target, and lists only the ones with findings, pages first', () => {
    const result = checkProject(
      [
        target('Card', 'component', 'var(--ghost)'),
        target('Lobby', 'view', 'var(--ink)'),
        target('about', 'page', 'var(--missing)'),
      ],
      TOKENS
    );
    expect(result.checked).toBe(3);
    expect(result.withFindings.map((r) => `${r.kind}:${r.name}`)).toEqual(['page:about', 'component:Card']);
    expect(result.withFindings[0]?.findings[0]?.kind).toBe('undeclared-token');
    expect(result.withFindings[0]?.findings[0]?.message).toContain('var(--missing)');
  });

  it('reports a clean project as clean, and passes through files that didn’t parse', () => {
    const result = checkProject([target('home', 'page', 'var(--ink)')], TOKENS, ['views/Broken/Broken.tsx']);
    expect(result).toEqual({ checked: 1, withFindings: [], unreadable: ['views/Broken/Broken.tsx'] });
  });

  it('checks nothing in an empty project', () => {
    expect(checkProject([], TOKENS)).toEqual({ checked: 0, withFindings: [], unreadable: [] });
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
