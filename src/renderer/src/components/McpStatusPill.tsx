import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconCopy } from '@tabler/icons-react';

import type { McpStatusResult } from '@shared/types';
import { connectSnippets, type ConnectSnippet } from '@lib/mcpConnect';

import { usePopover } from '../hooks/usePopover';
import { Tooltip } from './controls/Tooltip';
import styles from './McpStatusPill.module.css';

/**
 * Tells the user the MCP server exists, whether an agent is actually
 * using it, and offers the right command as a fallback.
 *
 * "Running" alone was a lie by omission: it stayed green while Claude
 * Code had silently declined the server and never connected. The pill
 * now has three states — connected, waiting, disabled. The copy button
 * opens a menu with the connect command or config for each agent, and,
 * when Claude Code has declined the server, the command that resets it.
 * see docs/notes/mcp-server.md
 */

const COPIED_FEEDBACK_MS = 1200;
/** Agents connect at their own pace; a few seconds is plenty. */
const POLL_MS = 4000;

/** Clears a declined `.mcp.json` prompt so Claude Code asks again. */
const RESET_COMMAND = 'claude mcp reset-project-choices';

type AgentState = 'connected' | 'waiting' | 'disabled';

const agentStateOf = (status: McpStatusResult): AgentState => {
  if (status.disabledIn.length > 0) return 'disabled';
  return status.agentConnected ? 'connected' : 'waiting';
};

const tooltipFor = (status: McpStatusResult, state: AgentState): string => {
  const registered = status.registered;
  const where =
    registered.length > 0
      ? `Registered in ${registered.join(', ')}.`
      : 'No agent config was written; copy the connect command instead.';
  switch (state) {
    case 'disabled':
      return `${status.disabledIn.join(', ')} has this server disabled for this project — the .mcp.json prompt was declined, so it never connects. Click to copy \`${RESET_COMMAND}\`, run it in the project folder, then restart the agent and approve.`;
    case 'connected':
      return `Scamp MCP server is running and an agent is connected. ${where} Copy the connect command or config for another agent.`;
    case 'waiting':
      return `Scamp MCP server is running — no agent has connected yet. ${where} First use may need approval inside your agent. Copy the connect command or config for your agent.`;
  }
};

const RESET_SNIPPET: ConnectSnippet = {
  id: 'claude-code-reset',
  label: 'Claude Code: reset',
  hint: 'Run in the project folder, then restart Claude Code and approve',
  text: RESET_COMMAND,
};

export const McpStatusPill = (): JSX.Element | null => {
  const [status, setStatus] = useState<McpStatusResult | null>(null);
  const [copied, setCopied] = useState(false);
  const menu = usePopover<HTMLButtonElement>({
    // Opens above when there's no room below: the pill sits in the
    // terminal panel at the bottom of the window.
    position: { width: 300, desiredMaxHeight: 420, align: 'right', minFitBelow: 360 },
  });

  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      void window.scamp
        .getMcpStatus()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {
          // No status is the same as no server for display purposes.
        });
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = (snippet: ConnectSnippet): void => {
    menu.setOpen(false);
    void window.scamp
      .writeClipboard({ text: snippet.text })
      // Only claim success when the write actually happened.
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  // Absent rather than greyed out: with no server there is nothing to say,
  // and a permanently dead indicator is worse than none.
  if (status === null || !status.running || status.url === null) return null;

  const state = agentStateOf(status);
  const snippets: ConnectSnippet[] = [
    ...(state === 'disabled' ? [RESET_SNIPPET] : []),
    ...(status.token === null ? [] : connectSnippets(status.url, status.token)),
  ];

  const menuEl =
    menu.open && menu.position ? (
      <div
        ref={menu.popoverRef}
        className={styles.menu}
        style={{
          left: menu.position.left,
          top: menu.position.top,
          bottom: menu.position.bottom,
          width: menu.position.width,
          maxHeight: menu.position.maxHeight,
        }}
        role="menu"
        aria-label="Copy the MCP connection for an agent"
        data-testid="mcp-connect-menu"
      >
        <div className={styles.menuTitle}>Connect an agent</div>
        {snippets.map((snippet) => (
          <button
            key={snippet.id}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-agent-id={snippet.id}
            onClick={() => handleCopy(snippet)}
          >
            <span className={styles.menuLabel}>{snippet.label}</span>
            <span className={styles.menuHint}>{snippet.hint}</span>
          </button>
        ))}
      </div>
    ) : null;

  return (
    <Tooltip label={tooltipFor(status, state)}>
      <div
        className={styles.pill}
        data-testid="mcp-status"
        data-running="true"
        data-agent={state}
      >
        <span className={styles.dot} data-state={state} aria-hidden="true" />
        <span className={styles.label}>MCP</span>
        <button
          ref={menu.triggerRef}
          className={styles.copy}
          onClick={menu.toggle}
          type="button"
          aria-label="Copy the MCP connection for an agent"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          data-action="copy-mcp-command"
          data-copied={copied ? 'true' : 'false'}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
        {menuEl !== null && createPortal(menuEl, document.body)}
      </div>
    </Tooltip>
  );
};
