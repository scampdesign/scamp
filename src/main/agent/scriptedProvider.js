const lastToolResult = (messages) => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const content = messages[i]?.content;
        if (!Array.isArray(content))
            continue;
        for (const block of content) {
            if (block.type !== 'tool_result')
                continue;
            const parts = Array.isArray(block.content) ? block.content : [];
            return parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
        }
    }
    return '(no tool result)';
};
const lastSystem = (messages) => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message?.role === 'system' && typeof message.content === 'string')
            return message.content;
    }
    return '(no system message)';
};
export const createScriptedProvider = (script) => {
    let next = 0;
    const provider = {
        requests: 0,
        streamTurn: async (request, callbacks) => {
            provider.requests += 1;
            const turn = script[next] ?? { content: [{ type: 'text', text: '(end of script)' }] };
            next += 1;
            if (request.signal.aborted)
                throw new Error('aborted');
            if (turn.error !== undefined)
                throw turn.error;
            const content = [];
            for (const [index, block] of turn.content.entries()) {
                if (block.type === 'tool_use') {
                    content.push({
                        type: 'tool_use',
                        id: `toolu_scripted_${next}_${index}`,
                        name: block.name,
                        input: block.input,
                        caller: { type: 'direct' },
                    });
                    continue;
                }
                const text = block.type === 'text'
                    ? block.text
                    : block.type === 'echo_system'
                        ? `System: ${lastSystem(request.messages).slice(0, 80)}`
                        : `Tool said: ${lastToolResult(request.messages).slice(0, 2000)}`;
                callbacks.onText(text);
                content.push({ type: 'text', text, citations: null });
            }
            const stop_reason = turn.stop_reason ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');
            // A test double: the message carries the fields the harness reads,
            // not every field of a real response.
            return {
                id: `msg_scripted_${next}`,
                type: 'message',
                role: 'assistant',
                model: 'scripted',
                content,
                stop_reason,
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 5 },
            };
        },
    };
    return provider;
};
