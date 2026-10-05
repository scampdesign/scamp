import { describeProviderError } from './providerErrors';
export const DEFAULT_MAX_STEPS = 24;
const emptyUsage = () => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
});
const isToolUse = (block) => block.type === 'tool_use';
const asArgs = (input) => input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input
    : null;
export const runTurn = async (options) => {
    const { provider, invoke, emit, signal } = options;
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const history = [
        ...options.history,
        { role: 'user', content: options.userContent },
    ];
    const usage = emptyUsage();
    const end = (outcome, message) => ({
        history,
        outcome,
        usage,
        ...(message !== undefined ? { message } : {}),
    });
    for (let step = 0; step < maxSteps; step += 1) {
        if (signal.aborted)
            return end('cancelled');
        let response;
        try {
            response = await provider.streamTurn({
                system: options.system,
                tools: options.tools,
                messages: history,
                effort: options.effort,
                signal,
            }, {
                onText: (text) => emit({ kind: 'text', text }),
                onProgress: (text) => emit({ kind: 'progress', text }),
            });
        }
        catch (err) {
            if (signal.aborted)
                return end('cancelled');
            const described = describeProviderError(err);
            return {
                ...end('error', described.message),
                ...(described.reason === 'invalid-key' ? { keyRejected: true } : {}),
            };
        }
        usage.inputTokens += response.usage.input_tokens;
        usage.outputTokens += response.usage.output_tokens;
        usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
        const toolUses = response.content.filter(isToolUse);
        const keep = () => {
            if (response.content.length > 0)
                history.push({ role: 'assistant', content: response.content });
        };
        switch (response.stop_reason) {
            case 'tool_use':
                break;
            case 'pause_turn':
                keep();
                continue;
            case 'refusal':
                // A refusal can cut a tool call off mid-input: never run it, and
                // never keep a tool_use there will be no result for.
                if (toolUses.length === 0)
                    keep();
                return end('refusal', 'Claude declined this request.');
            case 'max_tokens':
                if (toolUses.length === 0)
                    keep();
                return end('max-tokens', 'The reply was too long and was cut off.');
            default:
                keep();
                return end('done');
        }
        keep();
        // Every tool result goes back in ONE user message. Splitting them
        // teaches the model to stop calling tools in parallel.
        const results = await Promise.all(toolUses.map(async (use) => {
            emit({ kind: 'tool-start', toolId: use.id, name: use.name });
            const args = asArgs(use.input);
            const result = args === null
                ? { content: [{ type: 'text', text: 'The tool input must be a JSON object.' }], isError: true }
                : await invoke(use.name, args);
            const ok = result.isError !== true;
            emit({ kind: 'tool-end', toolId: use.id, name: use.name, ok });
            return {
                type: 'tool_result',
                tool_use_id: use.id,
                content: result.content.map((c) => ({ type: 'text', text: c.text })),
                ...(ok ? {} : { is_error: true }),
            };
        }));
        history.push({ role: 'user', content: results });
    }
    return end('too-many-steps', 'This took more steps than one message allows. Ask again to continue.');
};
