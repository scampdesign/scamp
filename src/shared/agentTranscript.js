/** A user message and the reply it's waiting for. */
export const startTurn = (entries, turnId, text, context) => [
    ...entries,
    { role: 'user', id: `${turnId}:user`, text, context },
    { role: 'assistant', id: turnId, parts: [], progress: '', status: 'working' },
];
const withLastPart = (parts, kind, update) => {
    const last = parts.at(-1);
    if (last !== undefined && last.kind === kind)
        return [...parts.slice(0, -1), update(last)];
    return [...parts, update(null)];
};
const reduceAssistant = (entry, event) => {
    switch (event.kind) {
        case 'text':
            return {
                ...entry,
                progress: '',
                parts: withLastPart(entry.parts, 'text', (part) => ({
                    kind: 'text',
                    text: (part?.kind === 'text' ? part.text : '') + event.text,
                })),
            };
        case 'progress':
            return { ...entry, progress: entry.progress + event.text };
        case 'tool-start':
            return {
                ...entry,
                progress: '',
                parts: withLastPart(entry.parts, 'tools', (part) => ({
                    kind: 'tools',
                    calls: [
                        ...(part?.kind === 'tools' ? part.calls : []),
                        { id: event.toolId, name: event.name, status: 'running' },
                    ],
                })),
            };
        case 'tool-end':
            return {
                ...entry,
                parts: entry.parts.map((part) => part.kind !== 'tools'
                    ? part
                    : {
                        kind: 'tools',
                        calls: part.calls.map((call) => call.id === event.toolId
                            ? {
                                ...call,
                                status: event.ok ? 'ok' : 'failed',
                                ...(event.summary !== undefined ? { summary: event.summary } : {}),
                            }
                            : call),
                    }),
            };
        case 'confirm-request':
            return {
                ...entry,
                progress: '',
                parts: [...entry.parts, { kind: 'confirm', id: event.confirmId, items: event.items, state: 'pending' }],
            };
        case 'confirm-resolved':
            return {
                ...entry,
                parts: entry.parts.map((part) => part.kind === 'confirm' && part.id === event.confirmId
                    ? { ...part, state: event.approved ? 'approved' : 'declined' }
                    : part),
            };
        case 'turn-end':
            return {
                ...entry,
                progress: '',
                status: event.outcome,
                usage: event.usage,
                ...(event.message !== undefined ? { message: event.message } : {}),
            };
    }
};
/**
 * Fold one event in. An event for a turn the transcript doesn't have — one
 * from before a reset — is ignored.
 */
export const applyAgentEvent = (entries, event) => entries.map((entry) => entry.role === 'assistant' && entry.id === event.turnId ? reduceAssistant(entry, event) : entry);
/**
 * A transcript read back from disk, made safe to show: a reply that was
 * still working when it was saved can't finish now, and a question it
 * asked can't be answered.
 */
export const settleTranscript = (entries) => entries.map((entry) => entry.role !== 'assistant' || entry.status !== 'working'
    ? entry
    : {
        ...entry,
        progress: '',
        status: 'cancelled',
        message: 'Stopped before it finished.',
        parts: entry.parts.map((part) => part.kind === 'confirm' && part.state === 'pending' ? { ...part, state: 'declined' } : part),
    });
