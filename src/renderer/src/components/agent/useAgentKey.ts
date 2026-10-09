import { useCallback, useEffect, useState } from 'react';

import type { AgentKeyStatus } from '@shared/types';

export type AgentKeyControls = {
  /** Null until main answers. */
  status: AgentKeyStatus | null;
  checking: boolean;
  error: string | null;
  connect: (key: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

/**
 * The provider key's status and the two things a user can do with it.
 * Shared by Settings and the Agent panel's connect prompt. The key passes
 * through `connect` once and is never held here.
 */
export const useAgentKey = (enabled: boolean): AgentKeyControls => {
  const [status, setStatus] = useState<AgentKeyStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void window.scamp.agentKeyStatus().then((result) => {
      if (!cancelled) setStatus(result.status);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const connect = useCallback(async (key: string): Promise<boolean> => {
    setChecking(true);
    setError(null);
    const result = await window.scamp.agentKeySet(key);
    setChecking(false);
    if (result.ok) {
      setStatus(result.status);
      return true;
    }
    setError(result.message);
    return false;
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    await window.scamp.agentKeyClear();
    setError(null);
    setStatus('not-connected');
  }, []);

  return { status, checking, error, connect, disconnect };
};
