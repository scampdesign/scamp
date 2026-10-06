import { describe, it, expect } from 'vitest';
import type { BetaMessageParam, BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { AgentEvent } from '@shared/types';
import { createScriptedProvider, type ScriptedTurn } from '../src/main/agent/scriptedProvider';
import type { AgentProvider, ProviderRequest } from '../src/main/agent/provider';
import { createAgentSession } from '../src/main/agent/session';
import { importCleanupSkill, IMPORT_CLEANUP_VERSION } from '../src/main/agent/skills/importCleanup';
import { skillFor } from '../src/main/agent/skills';
import { reactImportSkill } from '../src/main/agent/skills/reactImport';
import { REACT_SOURCE_TOOL } from '../src/main/agent/reactSourceTool';
import { describeToolCall } from '../src/main/agent/confirmPolicy';
import { WRITE_TOOLS } from '../src/main/agent/writeTools';

/**
 * Skills: a cleanup runs under its own instructions, tools and effort,
 * and the token mode the user picked holds even if the model ignores it.
 */

describe('importCleanupSkill', () => {
  it('tells the agent the page must look the same, and to plan before editing', () => {
    const skill = importCleanupSkill('keep-literal');
    expect(skill.instructions).toContain('the page must look the same');
    expect(skill.instructions).toContain('ask the user to go ahead');
    expect(skill.version).toBe(IMPORT_CLEANUP_VERSION);
    expect(skill.effort).toBe('high');
  });

  it('says a display the panel can’t express is left alone', () => {
    // The create-tokens eval run removed `display: inline` from ten
    // elements to clear their findings, and the page stopped matching.
    const { instructions } = importCleanupSkill('create-tokens');
    expect(instructions).toContain('Not every finding is yours to fix');
    expect(instructions).toContain('inline, inline-block, list-item');
  });

  it('says which token mode the user chose', () => {
    expect(importCleanupSkill('create-tokens').instructions).toContain('chose to create theme tokens');
    expect(importCleanupSkill('keep-literal').instructions).toContain('chose to keep literal values');
  });

  it('drops the theme tool when keeping literal values, and keeps it otherwise', () => {
    const names = (mode: 'create-tokens' | 'keep-literal'): string[] =>
      importCleanupSkill(mode).tools(WRITE_TOOLS).map((t) => t.name);
    expect(names('keep-literal')).not.toContain('scamp_set_theme_tokens');
    expect(names('create-tokens')).toContain('scamp_set_theme_tokens');
    expect(importCleanupSkill('keep-literal').allows('scamp_set_theme_tokens')).toBe(false);
    expect(importCleanupSkill('keep-literal').allows('scamp_set_styles')).toBe(true);
  });

  it('is what a request names', () => {
    expect(skillFor({ id: 'import-cleanup', tokenMode: 'keep-literal' }).id).toBe('import-cleanup');
  });
});

describe('a session running a skill', () => {
  /** Records what each request carried, then plays the script. */
  const recording = (script: ScriptedTurn[], requests: ProviderRequest[]): AgentProvider => {
    const inner = createScriptedProvider(script);
    return {
      streamTurn: async (request, callbacks) => {
        requests.push({ ...request, messages: [...request.messages] });
        return inner.streamTurn(request, callbacks);
      },
    };
  };

  const session = (script: ScriptedTurn[], requests: ProviderRequest[], invoked: string[], events: AgentEvent[] = []) =>
    createAgentSession({
      getProvider: async () => recording(script, requests),
      invoke: async (name) => {
        invoked.push(name);
        return { content: [{ type: 'text', text: 'ok' }], summary: `did ${name}` };
      },
      system: 'base',
      tools: [...WRITE_TOOLS] as BetaTool[],
      emit: (e) => events.push(e),
      onKeyRejected: () => {},
    });

  it('sends the skill’s instructions once, as a system message after the user’s words', async () => {
    const requests: ProviderRequest[] = [];
    const agent = session(
      [{ content: [{ type: 'text', text: 'Plan…' }] }, { content: [{ type: 'text', text: 'Done.' }] }],
      requests,
      []
    );
    await agent.send('Clean up this page', '', 't1', { skill: importCleanupSkill('keep-literal') });
    await agent.idle();
    await agent.send('Go ahead', '', 't2');
    await agent.idle();
    const roles = (messages: ReadonlyArray<BetaMessageParam>): string[] => messages.map((m) => m.role);
    expect(roles(requests[0]?.messages ?? [])).toEqual(['user', 'system']);
    expect(roles(requests[1]?.messages ?? [])).toEqual(['user', 'system', 'assistant', 'user']);
    // The cached system prompt never changes.
    expect(requests.every((r) => r.system === 'base')).toBe(true);
  });

  it('runs with the skill’s effort and tools for the rest of the conversation', async () => {
    const requests: ProviderRequest[] = [];
    const agent = session([{ content: [{ type: 'text', text: 'a' }] }, { content: [{ type: 'text', text: 'b' }] }], requests, []);
    await agent.send('Clean up', '', 't1', { skill: importCleanupSkill('keep-literal') });
    await agent.idle();
    await agent.send('Go', '', 't2');
    await agent.idle();
    for (const request of requests) {
      expect(request.effort).toBe('high');
      expect(request.tools.map((t) => t.name)).not.toContain('scamp_set_theme_tokens');
    }
  });

  it('refuses the theme tool in keep-literal mode even when the model calls it', async () => {
    const invoked: string[] = [];
    const events: AgentEvent[] = [];
    const agent = session(
      [
        { content: [{ type: 'tool_use', name: 'scamp_set_theme_tokens', input: { tokens: { '--x': '1' } } }] },
        { content: [{ type: 'text', text: 'ok' }] },
      ],
      [],
      invoked,
      events
    );
    await agent.send('Clean up', '', 't1', { skill: importCleanupSkill('keep-literal') });
    // It always asks first; approve, so the refusal is what's tested.
    for (let i = 0; i < 50 && !events.some((e) => e.kind === 'confirm-request'); i += 1) {
      await new Promise((r) => setTimeout(r, 1));
    }
    const asked = events.find((e) => e.kind === 'confirm-request');
    if (asked?.kind === 'confirm-request') agent.answer(asked.confirmId, true);
    await agent.idle();
    expect(invoked).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'tool-end', name: 'scamp_set_theme_tokens', ok: false }));
  });

  it('does not stop for many edits once the plan is approved, but still asks before a delete', async () => {
    const edit = { type: 'tool_use' as const, name: 'scamp_set_styles', input: { element: 'a', set: 'gap: 1px' } };
    const events: AgentEvent[] = [];
    const invoked: string[] = [];
    const agent = session(
      [{ content: [edit, edit, edit, edit, edit, edit, edit] }, { content: [{ type: 'text', text: 'ok' }] }],
      [],
      invoked,
      events
    );
    await agent.send('Clean up', '', 't1', { skill: importCleanupSkill('keep-literal') });
    await agent.idle();
    expect(events.some((e) => e.kind === 'confirm-request')).toBe(false);
    expect(invoked).toHaveLength(7);
  });

  it('forgets the skill on a new conversation', async () => {
    const agent = session([{ content: [{ type: 'text', text: 'a' }] }], [], []);
    await agent.send('Clean up', '', 't1', { skill: importCleanupSkill('create-tokens') });
    await agent.idle();
    expect(agent.skill()?.id).toBe('import-cleanup');
    agent.reset();
    expect(agent.skill()).toBeNull();
  });
});

describe('reactImportSkill', () => {
  const skill = reactImportSkill();
  const all = [...WRITE_TOOLS, REACT_SOURCE_TOOL];

  it('is chosen by its request', () => {
    expect(skillFor({ id: 'react-import' }).id).toBe('react-import');
  });

  it('reads the source and sets conditions and names, and can’t restyle or delete', () => {
    const names = skill.tools(all).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['scamp_get_react_source', 'scamp_set_show', 'scamp_rename_list', 'scamp_set_tag']));
    for (const off of ['scamp_set_styles', 'scamp_delete_element', 'scamp_set_theme_tokens', 'scamp_extract_component']) {
      expect(names).not.toContain(off);
      expect(skill.allows(off)).toBe(false);
    }
  });

  it('plans first, and says the view must look the same', () => {
    expect(skill.planApproved).toBe(true);
    expect(skill.instructions).toContain('must look the same');
    expect(skill.instructions).toContain('scamp_get_react_source');
  });
});

describe('describeToolCall — binding edits', () => {
  it('says what a condition and a rename will do', () => {
    expect(describeToolCall({ name: 'scamp_set_show', input: { element: 'badge_0001', flag: 'isOverdue' } })).toBe(
      'Show badge_0001 only when isOverdue'
    );
    expect(describeToolCall({ name: 'scamp_rename_list', input: { list: 'items', to: 'claims' } })).toBe('Rename the list items to claims');
  });
});
