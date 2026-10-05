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
  });
  const history = useHistoryStore.getState();
  history.setActivePageId('home.tsx');
  history.commitInitialIfEmpty(useCanvasStore.getState().elements);
});

const entries = (): number => useHistoryStore.getState().perPage['home.tsx']?.entries.length ?? 0;

describe('executeAgentEdit', () => {
  it('applies an edit to the canvas and says what changed', () => {
    const answer = executeAgentEdit('scamp_set_styles', { element: 'card_a1b2', set: 'gap: 24px' }, 't1');
    expect(answer.ok).toBe(true);
    expect(answer.summary).toBe('Updated card_a1b2 — gap: 24px;');
    expect(answer.text).toContain('Touched: card_a1b2 (id a1b2)');
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(24);
    endAgentTurnHistory('t1');
  });

  it('undoes every edit from one turn in a single step', () => {
    const before = entries();
    executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 24px' }, 't1');
    executeAgentEdit('scamp_set_text', { element: 'e5f6', text: 'Changed' }, 't1');
    executeAgentEdit('scamp_set_tag', { element: 'a1b2', tag: 'section' }, 't1');
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

  it('keeps two turns as two undo steps', () => {
    const before = entries();
    executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 24px' }, 't1');
    endAgentTurnHistory('t1');
    executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 32px' }, 't2');
    endAgentTurnHistory('t2');
    expect(entries()).toBe(before + 2);
    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(24);
  });

  it('leaves no transaction open when a turn makes no edit', () => {
    endAgentTurnHistory('never-edited');
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });

  it('reports a failed edit without touching the canvas or history', () => {
    const before = useCanvasStore.getState().elements;
    const answer = executeAgentEdit('scamp_set_text', { element: 'a1b2', text: 'x' }, 't1');
    expect(answer.ok).toBe(false);
    expect(useCanvasStore.getState().elements).toBe(before);
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });

  it('refuses to edit while a snapshot preview is showing', () => {
    useCanvasStore.setState({
      snapshotPreview: {} as NonNullable<ReturnType<typeof useCanvasStore.getState>['snapshotPreview']>,
    });
    const answer = executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 1px' }, 't1');
    expect(answer).toMatchObject({ ok: false });
    expect(answer.text).toContain('snapshot preview');
  });

  it('refuses an edit it does not know', () => {
    expect(executeAgentEdit('scamp_delete_everything', {}, 't1')).toMatchObject({ ok: false });
  });

  it('passes on what Scamp’s checks found on the touched element', () => {
    const answer = executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'color: var(--nowhere)' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.text).toContain('Check: card_a1b2');
    expect(answer.text).toContain('--nowhere');
  });
});
