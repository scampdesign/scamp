import { describe, it, expect, beforeEach } from 'vitest';

import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { parseCode } from '@lib/parseCode';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import {
  endAgentTurnHistory,
  executeAgentEdit,
} from '../src/renderer/src/syncBridge/agentToolResponder';

/**
 * The Scamp Agent's edits against the real stores: they land in the
 * canvas, and one turn's edits undo as one step.
 * see docs/plans/builtin-agent-plan.md
 */

const TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="a1b2" className={styles.card_a1b2}>
    <p data-scamp-id="e5f6" className={styles.text_e5f6}>Body</p>
  </div>
</div>`;
const CSS = `.card_a1b2 { display: flex; gap: 8px; }`;

beforeEach(() => {
  useHistoryStore.setState({
    perPage: {},
    activePageId: null,
    transactionDepth: 0,
    pendingExternalEdit: null,
    restoreSnapshot: null,
  });
  useHistoryStore.getState().setRestoreSnapshot((snapshot) => {
    useCanvasStore.setState({ elements: snapshot });
  });
  useCanvasStore.setState({
    projectPath: '/project',
    elements: parseCode(TSX, CSS).elements,
    rootElementId: 'root',
    breakpoints: DEFAULT_BREAKPOINTS,
    themeTokens: [],
    snapshotPreview: null,
    activeComponent: null,
    selectedElementIds: [],
    componentTrees: {},
  });
  const history = useHistoryStore.getState();
  history.setActivePageId('home.tsx');
  history.commitInitialIfEmpty(useCanvasStore.getState().elements);
});

/** The few main-process calls these edits make, recorded. */
const calls: string[] = [];
let themeOnDisk = ':root {\n  --color-text: #111111;\n}\n';
(globalThis as { window?: unknown }).window = {
  scamp: {
    readTheme: async (): Promise<string> => themeOnDisk,
    writeTheme: async ({ content }: { content: string }): Promise<void> => {
      calls.push('writeTheme');
      themeOnDisk = content;
    },
    createComponent: async ({ componentName }: { componentName: string }): Promise<{ name: string }> => {
      calls.push(`createComponent ${componentName}`);
      return { name: componentName };
    },
  },
};

const entries = (): number => useHistoryStore.getState().perPage['home.tsx']?.entries.length ?? 0;

describe('executeAgentEdit', () => {
  it('applies an edit to the canvas and says what changed', async () => {
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'card_a1b2', set: 'gap: 24px' }, 't1');
    expect(answer.ok).toBe(true);
    expect(answer.summary).toBe('Updated card_a1b2 — gap: 24px;');
    expect(answer.text).toContain('Touched: card_a1b2 (id a1b2)');
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(24);
    endAgentTurnHistory('t1');
  });

  it('undoes every edit from one turn in a single step', async () => {
    const before = entries();
    await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 24px' }, 't1');
    await executeAgentEdit('scamp_set_text', { element: 'e5f6', text: 'Changed' }, 't1');
    await executeAgentEdit('scamp_set_tag', { element: 'a1b2', tag: 'section' }, 't1');
    endAgentTurnHistory('t1');

    expect(entries()).toBe(before + 1);
    const last = useHistoryStore.getState().perPage['home.tsx']?.entries.at(-1);
    expect(last?.kind).toBe('agent-edit');

    useHistoryStore.getState().undo();
    const elements = useCanvasStore.getState().elements;
    expect(elements['a1b2']?.gap).toBe(8);
    expect(elements['a1b2']?.tag).not.toBe('section');
    expect(elements['e5f6']?.text).toBe('Body');
  });

  it('keeps two turns as two undo steps', async () => {
    const before = entries();
    await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 24px' }, 't1');
    endAgentTurnHistory('t1');
    await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 32px' }, 't2');
    endAgentTurnHistory('t2');
    expect(entries()).toBe(before + 2);
    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(24);
  });

  it('leaves no transaction open when a turn makes no edit', async () => {
    endAgentTurnHistory('never-edited');
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });

  it('reports a failed edit without touching the canvas or history', async () => {
    const before = useCanvasStore.getState().elements;
    const answer = await executeAgentEdit('scamp_set_text', { element: 'a1b2', text: 'x' }, 't1');
    expect(answer.ok).toBe(false);
    expect(useCanvasStore.getState().elements).toBe(before);
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });

  it('refuses to edit while a snapshot preview is showing', async () => {
    useCanvasStore.setState({
      snapshotPreview: {} as NonNullable<ReturnType<typeof useCanvasStore.getState>['snapshotPreview']>,
    });
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 1px' }, 't1');
    expect(answer).toMatchObject({ ok: false });
    expect(answer.text).toContain('snapshot preview');
  });

  it('refuses an edit it does not know', async () => {
    expect(await executeAgentEdit('scamp_delete_everything', {}, 't1')).toMatchObject({ ok: false });
  });

  it('passes on what Scamp’s checks found on the touched element', async () => {
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'color: var(--nowhere)' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.text).toContain('Check: card_a1b2');
    expect(answer.text).toContain('--nowhere');
  });
});

describe('theme tokens', () => {
  it('writes them to theme.css and the store, outside the undo stack', async () => {
    calls.length = 0;
    const answer = await executeAgentEdit('scamp_set_theme_tokens', { tokens: { '--color-accent': '#ff6600' } }, 't1');
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, summary: 'Theme tokens — added --color-accent' });
    expect(answer.text).toContain('Undo AI changes');
    expect(calls).toEqual(['writeTheme']);
    expect(themeOnDisk).toContain('--color-accent: #ff6600');
    expect(themeOnDisk).toContain('--color-text: #111111');
    expect(useCanvasStore.getState().themeTokens.map((t) => t.name)).toContain('--color-accent');
  });

  it('writes nothing when every value is already set', async () => {
    calls.length = 0;
    const answer = await executeAgentEdit('scamp_set_theme_tokens', { tokens: { '--color-text': '#111111' } }, 't1');
    expect(answer.ok).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('extract component', () => {
  it('creates the component, swaps in an instance, and reports it for undo', async () => {
    calls.length = 0;
    const before = entries();
    const answer = await executeAgentEdit('scamp_extract_component', { element: 'card_a1b2', name: 'Card' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, createdComponent: 'Card' });
    expect(answer.summary).toBe('Made card_a1b2 into the component Card');
    expect(calls).toEqual(['createComponent Card']);
    const state = useCanvasStore.getState();
    expect(state.componentTrees['Card']).toBeDefined();
    const instances = Object.values(state.elements).filter((el) => el.type === 'component-instance');
    expect(instances.map((el) => el.componentName)).toEqual(['Card']);
    expect(state.elements['e5f6']).toBeUndefined();
    // One undo step, which brings the original back.
    expect(entries()).toBe(before + 1);
    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().elements['e5f6']?.text).toBe('Body');
  });

  it('writes nothing for a plan it refuses', async () => {
    calls.length = 0;
    const answer = await executeAgentEdit('scamp_extract_component', { element: 'card_a1b2', name: 'card' }, 't1');
    expect(answer.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
