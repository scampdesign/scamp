import { describe, it, expect } from 'vitest';

import { createScriptedProvider } from '../src/main/agent/scriptedProvider';
import { createAgentSession } from '../src/main/agent/session';

describe('createAgentSession', () => {
  it('frees the turn when loading the key throws, so the next send runs', async () => {
    // Audit item 13: the slot stayed claimed and every send said "busy".
    let failing = true;
    const agent = createAgentSession({
      getProvider: async () => {
        if (failing) throw new Error('EACCES: key file unreadable');
        return createScriptedProvider([{ content: [{ type: 'text', text: 'Hi.' }] }]);
      },
      invoke: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      system: 'base',
      tools: [],
      emit: () => {},
      onKeyRejected: () => {},
    });

    expect(await agent.send('Hello', '', 't1')).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(agent.isBusy()).toBe(false);

    failing = false;
    expect(await agent.send('Hello again', '', 't2')).toEqual({ ok: true });
    await agent.idle();
  });
});
