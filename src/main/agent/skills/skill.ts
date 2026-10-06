import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';

/**
 * A Scamp-authored skill: standing instructions for one kind of job, the
 * tools it may use, and how hard to think. Versioned here, in code, so the
 * cleanup rules live in one place and an eval can pin what it measured.
 *
 * A skill is chosen when a conversation starts and holds for the rest of
 * it. Its instructions ride in as a mid-conversation system message, so
 * the cached system prompt in front of them never changes.
 * see docs/plans/builtin-agent-plan.md
 */
export type AgentSkill = {
  id: string;
  /** Bumped whenever the instructions change, so an eval result names what it measured. */
  version: number;
  instructions: string;
  /** The tools this skill may use, from everything the agent has. */
  tools: (all: ReadonlyArray<BetaTool>) => BetaTool[];
  /** Whether a tool call is allowed — enforced when it runs, not only by omission. */
  allows: (toolName: string) => boolean;
  effort: 'low' | 'medium' | 'high';
  /**
   * The skill asks the user to approve a plan before editing, so the
   * many-edits check would only interrupt work already agreed. Deletes,
   * components and theme changes still always ask.
   */
  planApproved: boolean;
};

export type { AgentSkillRequest as SkillRequest, AgentTokenMode as TokenMode } from '@shared/types';
