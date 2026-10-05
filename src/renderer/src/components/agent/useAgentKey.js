import { useCallback, useEffect, useState } from 'react';
/**
 * The provider key's status and the two things a user can do with it.
 * Shared by Settings and the Agent panel's connect prompt. The key passes
 * through `connect` once and is never held here.
 */
export const useAgentKey = (enabled) => {
    const [status, setStatus] = useState(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!enabled)
            return;
        let cancelled = false;
        void window.scamp.agentKeyStatus().then((result) => {
            if (!cancelled)
                setStatus(result.status);
        });
        return () => {
            cancelled = true;
        };
    }, [enabled]);
    const connect = useCallback(async (key) => {
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
    const disconnect = useCallback(async () => {
        await window.scamp.agentKeyClear();
        setError(null);
        setStatus('not-connected');
    }, []);
    return { status, checking, error, connect, disconnect };
};
