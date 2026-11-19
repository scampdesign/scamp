import { describe, expect, it } from 'vitest';

import { addAgentText, addAgentTool, endTurn, setTurnUndone, startTurn, type ChatTurn } from '@lib/embeddedChat';

const started = (): ChatTurn[] => startTurn([], 'r1', ['Changed spacing on Card', 'make it bold']);

describe('startTurn', () => {
  it('adds the user’s batch and a running agent turn', () => {
    expect(started()).toEqual([
      { id: 'r1-u', role: 'user', lines: ['Changed spacing on Card', 'make it bold'] },
      { id: 'r1-a', role: 'agent', text: '', tools: [], status: 'running' },
    ]);
  });
});

describe('the running turn', () => {
  it('grows with streamed text and tools', () => {
    const chat = addAgentTool(addAgentText(addAgentText(started(), 'Done'), '.'), 'Edited src/Card.css', true);
    expect(chat[1]).toMatchObject({ text: 'Done.', tools: [{ text: 'Edited src/Card.css', ok: true }] });
  });

  it('ends with its run, and only the running turn changes', () => {
    const first = endTurn(started(), 'run-1', 'done');
    const second = endTurn(addAgentText(startTurn(first, 'r2', ['x']), 'Hi'), 'run-2', 'error', 'It stopped.');
    expect(second[1]).toMatchObject({ status: 'done', runId: 'run-1' });
    expect(second[3]).toMatchObject({ status: 'error', runId: 'run-2', text: 'Hi', message: 'It stopped.' });
  });

  it('ignores text when nothing is running', () => {
    const done = endTurn(started(), 'run-1', 'done');
    expect(addAgentText(done, 'late')).toEqual(done);
    expect(addAgentText([], 'late')).toEqual([]);
  });
});

describe('setTurnUndone', () => {
  it('marks a run’s turn undone, and done again on redo', () => {
    const done = endTurn(started(), 'run-1', 'done');
    expect(setTurnUndone(done, 'run-1', true)[1]).toMatchObject({ status: 'undone' });
    expect(setTurnUndone(setTurnUndone(done, 'run-1', true), 'run-1', false)[1]).toMatchObject({ status: 'done' });
    expect(setTurnUndone(done, 'run-9', true)).toEqual(done);
  });
});
