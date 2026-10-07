import { describe, it, expect } from 'vitest';

import { DEFAULT_THEME_CSS } from '@shared/templates';
import { createHeadlessCanvas } from '@lib/agentHeadless';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { runTurn } from '../src/main/agent/harness';
import { createScriptedProvider } from '../src/main/agent/scriptedProvider';

/**
 * The agent's canvas without a window — what the import-cleanup eval runs
 * on. It must answer the way the app does, or the eval measures a
 * different agent.
 */

const TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="a1b2" className={styles.card_a1b2}>
    <p data-scamp-id="e5f6" className={styles.text_e5f6}>Body</p>
  </div>
  <div data-scamp-id="b7c8" className={styles.rect_b7c8}></div>
</div>`;
const CSS = `.card_a1b2 { display: flex; border-top-color: red; }`;

const canvas = () => {
  const parsed = parseCode(TSX, CSS);
  return createHeadlessCanvas(
    { elements: parsed.elements, rootId: parsed.rootId, themeCss: DEFAULT_THEME_CSS, components: {} },
    {
      viewName: 'Imported',
      importSource: { url: 'https://example.com', html: '<p>Body</p>', css: '.card { border-top: 1px solid red }' },
    }
  );
};

const textOf = (result: { content: Array<{ text: string }> }): string => result.content.map((c) => c.text).join('');

describe('createHeadlessCanvas', () => {
  it('answers read tools with the app’s own formatting', async () => {
    const tree = await canvas().invoke('scamp_get_element_tree', {});
    expect(textOf(tree)).toContain('card_a1b2');
    expect(tree.isError).toBeUndefined();
  });

  it('checks the view it holds, with the app’s lint', async () => {
    const check = textOf(await canvas().invoke('scamp_check_view', { name: 'Imported' }));
    expect(check).toContain('side-not-typed');
  });

  it('serves the imported original', async () => {
    const source = textOf(await canvas().invoke('scamp_get_import_source', { name: 'Imported', part: 'css' }));
    expect(source).toContain('border-top: 1px solid red');
  });

  it('applies an edit and says what changed, as the app does', async () => {
    const c = canvas();
    const answer = await c.invoke('scamp_set_styles', { element: 'card_a1b2', remove: ['border-top-color'], set: 'gap: 8px' });
    expect(answer.summary).toBe('Updated card_a1b2 — gap: 8px; removed border-top-color');
    expect(c.state().elements['a1b2']?.gap).toBe(8);
    // The finding the edit fixed is gone from the view's check.
    expect(textOf(await c.invoke('scamp_check_view', { name: 'Imported' }))).not.toContain('side-not-typed');
  });

  it('edits its own view when named, and refuses any other', async () => {
    const c = canvas();
    expect((await c.invoke('scamp_set_styles', { view: 'Imported', element: 'a1b2', set: 'gap: 2px' })).isError).toBeUndefined();
    const before = c.state();
    const other = await c.invoke('scamp_set_styles', { view: 'Billing', element: 'a1b2', set: 'gap: 9px' });
    expect(other.isError).toBe(true);
    expect(textOf(other)).toBe('Only Imported is loaded here.');
    expect(c.state()).toBe(before);
  });

  it('reports a refused edit as an error and changes nothing', async () => {
    const c = canvas();
    const before = c.state();
    const answer = await c.invoke('scamp_set_text', { element: 'a1b2', text: 'x' });
    expect(answer.isError).toBe(true);
    expect(c.state()).toBe(before);
  });

  it('adds theme tokens to its theme', async () => {
    const c = canvas();
    const answer = await c.invoke('scamp_set_theme_tokens', { tokens: { '--color-accent': '#ff6600' } });
    expect(answer.summary).toBe('Theme tokens — added --color-accent');
    expect(c.state().themeCss).toContain('--color-accent: #ff6600');
  });

  it('extracts a component, keeping the files Scamp would write', async () => {
    const c = canvas();
    const answer = await c.invoke('scamp_extract_component', { element: 'card_a1b2', name: 'Card' });
    expect(answer.summary).toBe('Made card_a1b2 into the component Card');
    expect(Object.keys(c.state().components)).toEqual(['Card']);
    const instances = Object.values(c.state().elements).filter((el) => el.type === 'component-instance');
    expect(instances).toHaveLength(1);
    // The component now shows up to the read tools.
    expect(textOf(await c.invoke('scamp_list_components', {}))).toContain('Card');
  });

  it('runs a whole agent turn, and the result still round-trips', async () => {
    const c = canvas();
    const result = await runTurn({
      provider: createScriptedProvider([
        {
          content: [
            { type: 'tool_use', name: 'scamp_set_styles', input: { element: 'a1b2', remove: ['border-top-color'] } },
            { type: 'tool_use', name: 'scamp_set_tag', input: { element: 'a1b2', tag: 'article' } },
          ],
        },
        { content: [{ type: 'text', text: 'Done.' }] },
      ]),
      system: 'test',
      tools: [],
      invoke: c.invoke,
      history: [],
      userContent: 'Clean up',
      effort: 'high',
      signal: new AbortController().signal,
      emit: () => {},
    });
    expect(result.outcome).toBe('done');
    const { elements, rootId } = c.state();
    expect(elements['a1b2']?.tag).toBe('article');
    const first = generateCode({ elements, rootId, pageName: 'P' });
    const reparsed = parseCode(first.tsx, first.css);
    expect(generateCode({ elements: reparsed.elements, rootId, pageName: 'P' })).toEqual(first);
  });
});
