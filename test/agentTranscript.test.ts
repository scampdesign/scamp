import { describe, it, expect } from 'vitest';

import type { AgentEvent } from '@shared/types';
import {
  agentContextLine,
  applyAgentEvent,
  formatUsage,
  splitInlineCode,
  startTurn,
  toolLabel,
  type TranscriptEntry,
} from '@lib/agentTranscript';

const USAGE = { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 4000, cacheWriteTokens: 0 };

const fold = (events: AgentEvent[], start: TranscriptEntry[] = startTurn([], 't1', 'Hi', 'Page: home')) =>
  events.reduce(applyAgentEvent, start);

const reply = (entries: TranscriptEntry[]) => {
  const last = entries.at(-1);
  if (last?.role !== 'assistant') throw new Error('no reply');
  return last;
};

describe('startTurn', () => {
  it('adds the user message and an empty reply that is working', () => {
    expect(startTurn([], 't1', 'Center it', 'Page: home')).toEqual([
      { role: 'user', id: 't1:user', text: 'Center it', context: 'Page: home' },
      { role: 'assistant', id: 't1', parts: [], progress: '', status: 'working' },
    ]);
  });
});

describe('applyAgentEvent', () => {
  it('joins streamed text into one part', () => {
    const entries = fold([
      { kind: 'text', turnId: 't1', text: 'The card ' },
      { kind: 'text', turnId: 't1', text: 'is centred.' },
    ]);
    expect(reply(entries).parts).toEqual([{ kind: 'text', text: 'The card is centred.' }]);
  });

  it('keeps text and tool calls in the order they happened', () => {
    const entries = fold([
      { kind: 'text', turnId: 't1', text: 'Let me look.' },
      { kind: 'tool-start', turnId: 't1', toolId: 'a', name: 'scamp_get_element_tree' },
      { kind: 'tool-start', turnId: 't1', toolId: 'b', name: 'scamp_get_theme_tokens' },
      { kind: 'tool-end', turnId: 't1', toolId: 'a', name: 'scamp_get_element_tree', ok: true },
      { kind: 'tool-end', turnId: 't1', toolId: 'b', name: 'scamp_get_theme_tokens', ok: false },
      { kind: 'text', turnId: 't1', text: 'Found it.' },
    ]);
    expect(reply(entries).parts).toEqual([
      { kind: 'text', text: 'Let me look.' },
      {
        kind: 'tools',
        calls: [
          { id: 'a', name: 'scamp_get_element_tree', status: 'ok' },
          { id: 'b', name: 'scamp_get_theme_tokens', status: 'failed' },
        ],
      },
      { kind: 'text', text: 'Found it.' },
    ]);
  });

  it('shows the progress note until the agent acts', () => {
    const working = fold([
      { kind: 'progress', turnId: 't1', text: 'Checking the ' },
      { kind: 'progress', turnId: 't1', text: 'layout.' },
    ]);
    expect(reply(working).progress).toBe('Checking the layout.');
    const acted = fold([{ kind: 'tool-start', turnId: 't1', toolId: 'a', name: 'x' }], working);
    expect(reply(acted).progress).toBe('');
  });

  it('records how the turn ended, with usage and any message', () => {
    const entries = fold([
      { kind: 'turn-end', turnId: 't1', outcome: 'error', usage: USAGE, message: 'Rate limited.' },
    ]);
    expect(reply(entries)).toMatchObject({ status: 'error', usage: USAGE, message: 'Rate limited.' });
  });

  it('ignores an event for a turn it does not have', () => {
    const start = startTurn([], 't1', 'Hi', '');
    expect(applyAgentEvent(start, { kind: 'text', turnId: 'old', text: 'stale' })).toEqual(start);
  });

  it('only changes the reply the event is for', () => {
    const two = startTurn(startTurn([], 't1', 'One', ''), 't2', 'Two', '');
    const entries = applyAgentEvent(two, { kind: 'text', turnId: 't2', text: 'Second.' });
    expect(entries[1]).toEqual(two[1]);
    expect(reply(entries).parts).toEqual([{ kind: 'text', text: 'Second.' }]);
  });
});

describe('toolLabel', () => {
  it('names a known tool in plain words', () => {
    expect(toolLabel('scamp_get_element_tree')).toBe('Read the layer tree');
  });

  it('falls back to a readable form of an unknown tool', () => {
    expect(toolLabel('scamp_do_something_new')).toBe('do something new');
  });
});

describe('agentContextLine', () => {
  const page = { kind: 'page' as const, name: 'home' };

  it('names the page and the selected element', () => {
    expect(agentContextLine({ target: page, selection: [{ className: 'rect_a1b2', name: 'Card' }] })).toBe(
      'Page: home · Selected: Card (rect_a1b2)'
    );
  });

  it('uses the class alone when the element has no name', () => {
    expect(agentContextLine({ target: page, selection: [{ className: 'rect_a1b2' }] })).toBe(
      'Page: home · Selected: rect_a1b2'
    );
  });

  it('counts the rest of a multiple selection', () => {
    expect(
      agentContextLine({
        target: page,
        selection: [{ className: 'rect_a1b2' }, { className: 'rect_c3d4' }, { className: 'text_e5f6' }],
      })
    ).toBe('Page: home · Selected: rect_a1b2 and 2 more');
  });

  it('says when nothing is selected', () => {
    expect(agentContextLine({ target: page, selection: [] })).toBe('Page: home · Nothing selected');
  });

  it('names a component or a view by its kind', () => {
    expect(agentContextLine({ target: { kind: 'component', name: 'Card' }, selection: [] })).toBe(
      'Component: Card · Nothing selected'
    );
    expect(agentContextLine({ target: { kind: 'view', name: 'Lobby' }, selection: [] })).toBe(
      'View: Lobby · Nothing selected'
    );
  });

  it('is empty when nothing is open', () => {
    expect(agentContextLine({ target: null, selection: [] })).toBe('');
  });
});

describe('formatUsage', () => {
  it('totals every kind of token', () => {
    expect(formatUsage(USAGE)).toBe('5,500 tokens');
  });

  it('handles zero', () => {
    expect(formatUsage({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(
      '0 tokens'
    );
  });
});

describe('splitInlineCode', () => {
  it('marks backtick spans as code', () => {
    expect(splitInlineCode('Set `display: flex` on `rect_a1b2`.')).toEqual([
      { code: false, text: 'Set ' },
      { code: true, text: 'display: flex' },
      { code: false, text: ' on ' },
      { code: true, text: 'rect_a1b2' },
      { code: false, text: '.' },
    ]);
  });

  it('returns plain text unchanged', () => {
    expect(splitInlineCode('No code here.')).toEqual([{ code: false, text: 'No code here.' }]);
  });

  it('leaves an unclosed backtick as written', () => {
    expect(splitInlineCode('Odd ` tick')).toEqual([{ code: false, text: 'Odd ` tick' }]);
  });

  it('does not let a span cross a line break', () => {
    expect(splitInlineCode('a `b\nc` d')).toEqual([{ code: false, text: 'a `b\nc` d' }]);
  });

  it('returns nothing for an empty string', () => {
    expect(splitInlineCode('')).toEqual([]);
  });

  it('keeps markup as text rather than interpreting it', () => {
    expect(splitInlineCode('<img src=x onerror=alert(1)>')).toEqual([
      { code: false, text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});
