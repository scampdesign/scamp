import { describe, expect, it } from 'vitest';

import type { EmbeddedQueueItem } from '@shared/types';

import { moduleClassAt } from '../src/main/embedded/content';
import { directStyleWrite } from '../src/main/embedded/fastPath';

/**
 * Edits Scamp writes into a CSS Module itself, without the agent: only
 * where the element's class and its rule are certain.
 */

const files: Record<string, string> = {
  'src/Card.jsx': [
    "import styles from './Card.module.css';", // 1
    "import other from '../shared/Other.module.css';", // 2
    'export const Card = () => (', // 3
    '  <article className={styles.card}>', // 4
    '    <h2 className={`${styles.name} big`}>Hi</h2>', // 5
    '    <p className={other["lead"]}>x</p>', // 6
    '    <span className="plain">y</span>', // 7
    '  </article>', // 8
    ');', // 9
  ].join('\n'),
  'src/Card.module.css': ['.card {', '  padding: 16px;', '  color: red;', '}', '', '.card:hover {', '  color: blue;', '}', ''].join('\n'),
  'shared/Other.module.css': '.lead { margin: 0; }\n.lead { margin: 4px; }\n',
};
const read = async (file: string): Promise<string | null> => files[file] ?? null;

const style = (patch: Partial<Extract<EmbeddedQueueItem, { kind: 'style' }>> = {}, source = 'src/Card.jsx:4:3'): EmbeddedQueueItem => ({
  id: 'a',
  kind: 'style',
  scope: 'all',
  element: { source, library: null, page: '/', selector: 'article', tag: 'article', classes: ['_card_1'], components: ['Card'], instanceCount: 3, usedAt: null, text: '' },
  changes: [{ property: 'padding', from: '16px', to: '24px' }],
  ...patch,
});

describe('moduleClassAt', () => {
  it('finds `styles.x` and the CSS Module it’s imported from', () => {
    expect(moduleClassAt(files['src/Card.jsx'] ?? '', 'src/Card.jsx:4:3')).toEqual({ file: 'src/Card.module.css', className: 'card' });
    expect(moduleClassAt(files['src/Card.jsx'] ?? '', 'src/Card.jsx:6:5')).toEqual({ file: 'shared/Other.module.css', className: 'lead' });
  });

  it('gives up on a template, a plain string, or no element there', () => {
    expect(moduleClassAt(files['src/Card.jsx'] ?? '', 'src/Card.jsx:5:5')).toBeNull();
    expect(moduleClassAt(files['src/Card.jsx'] ?? '', 'src/Card.jsx:7:5')).toBeNull();
    expect(moduleClassAt(files['src/Card.jsx'] ?? '', 'src/Card.jsx:1:1')).toBeNull();
  });
});

describe('directStyleWrite', () => {
  it('changes a declaration in place and adds a new one, leaving the rest as written', async () => {
    const out = await directStyleWrite(style({ changes: [{ property: 'padding', from: '16px', to: '24px' }, { property: 'gap', from: '', to: 'var(--space-2)' }] }), read);
    expect(out?.file).toBe('src/Card.module.css');
    expect(out?.content).toBe(['.card {', '  padding: 24px;', '  color: red;', '  gap: var(--space-2);', '}', '', '.card:hover {', '  color: blue;', '}', ''].join('\n'));
  });

  it('removes a declaration set back to its default', async () => {
    const out = await directStyleWrite(style({ changes: [{ property: 'color', from: 'red', to: 'initial' }] }), read);
    expect(out?.content).not.toContain('color: red');
    expect(out?.content).toContain('color: blue');
  });

  it('leaves to the agent: one instance of several, a state, a breakpoint, or more than one element', async () => {
    expect(await directStyleWrite(style({ scope: 'instance' }), read)).toBeNull();
    expect(await directStyleWrite(style({ state: 'hover' }), read)).toBeNull();
    expect(await directStyleWrite(style({ breakpoint: { width: 390, upTo: 767, project: [], direction: null } }), read)).toBeNull();
    const also = style();
    expect(await directStyleWrite({ ...also, also: [also.element] } as EmbeddedQueueItem, read)).toBeNull();
  });

  it('leaves to the agent: a class with two rules, no CSS Module, or an unsafe value', async () => {
    expect(await directStyleWrite(style({}, 'src/Card.jsx:6:5'), read)).toBeNull();
    expect(await directStyleWrite(style({}, 'src/Card.jsx:7:5'), read)).toBeNull();
    expect(await directStyleWrite(style({ changes: [{ property: 'color', from: '', to: 'red; } body { color: blue' }] }), read)).toBeNull();
    expect(await directStyleWrite({ id: 'i', kind: 'instruction', element: null, scope: 'all', text: 'x' }, read)).toBeNull();
  });
});
