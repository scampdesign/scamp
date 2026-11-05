import { buildAgentPrompt } from '@shared/embedded';
import { runTurn } from '../agent/harness';
import { EMBEDDED_READ_TOOLS, EMBEDDED_TOOLS, EMBEDDED_WRITE_TOOL_NAMES, embeddedToolInvoker } from './fileTools';
import { describeIdioms } from './idiom';
/**
 * Embedded Scamp's agent: always listening to a queue of edits the user
 * made on the running app, and writing them into the project's source.
 * Continuous by default (a short pause batches a burst of edits); paused,
 * the queue holds until Run now sends it all as one batch.
 * see docs/plans/embedded-scamp-plan.md
 */
export const BATCH_DELAY_MS = 1500;
export const embeddedSystemPrompt = (folder, idioms) => [
    'You are the Scamp Agent, working inside the user’s own React project. The user styles their running app visually in Scamp, and you write each change into the real source, so it holds after a reload and reads as if a careful developer on the team wrote it.',
    '',
    `The project is at ${folder}. Paths in your tools are relative to it.`,
    `It writes styles with: ${describeIdioms(idioms)}. Follow the conventions you find in the files you read: their naming, their tokens and theme values, their formatting.`,
    '',
    'Rules:',
    '- Read a file before you edit it. Make the smallest edit that produces the change. No refactors, renames or reformatting.',
    '- Use the project’s own tokens, variables or scale when one matches the value; otherwise write the value as given.',
    '- Never edit node_modules, lockfiles, env files or build config, and don’t run commands.',
    '- “This instance only” means leave the other instances unchanged; “every instance” means change the shared definition.',
    '- If a change can’t be made safely (the element comes from a library or from data), don’t guess: say what you’d need.',
    '- When you finish, reply in one or two plain sentences: what you changed, and in which files.',
].join('\n');
const DESIGN_CHECK_PROMPT = [
    'Review this project’s design in its source, without changing anything. Read its style files, theme or token files, and components.',
    'Report findings in Markdown under these headings, most important first, each with file:line, what you found, and what to do:',
    '## Tokens and consistency (one-off colours, sizes or spacing where the project has a token or scale)',
    '## Accessibility (text contrast, missing labels or alt text, focus styles, clickable divs)',
    '## Spacing and type scale (values off the scale, inconsistent gaps)',
    '## Duplicated styles (the same styles written in several places)',
    'Keep it to the 15 most useful findings. If a section has nothing, say so in one line.',
].join('\n');
export const createEmbeddedAgent = (deps) => {
    const state = { phase: 'idle', paused: false, queued: [], lastText: '', lastRunItemIds: [] };
    const touched = new Set();
    let history = [];
    let running = false;
    let timer = null;
    let abort = null;
    const delay = deps.batchDelayMs ?? BATCH_DELAY_MS;
    const invokerFor = deps.invoker ?? ((t, readOnly) => embeddedToolInvoker(deps.folder, t, readOnly));
    const publish = (patch) => {
        Object.assign(state, patch);
        deps.emit({ kind: 'state', state: { ...state, queued: [...state.queued], lastRunItemIds: [...state.lastRunItemIds] } });
    };
    const schedule = () => {
        if (timer !== null)
            clearTimeout(timer);
        timer = null;
        if (state.paused || running || state.queued.length === 0)
            return;
        timer = setTimeout(() => {
            timer = null;
            void run();
        }, delay);
    };
    const run = async () => {
        if (running || state.queued.length === 0)
            return;
        const provider = await deps.getProvider();
        if (provider === null) {
            publish({ phase: 'error', message: 'Sign in to Scamp and connect the agent to write your changes.' });
            return;
        }
        running = true;
        const items = state.queued.splice(0);
        abort = new AbortController();
        publish({ phase: 'thinking', lastText: '', message: undefined });
        let said = '';
        const result = await runTurn({
            provider,
            system: embeddedSystemPrompt(deps.folder, deps.idioms),
            tools: EMBEDDED_TOOLS,
            invoke: invokerFor(touched, false),
            history,
            userContent: buildAgentPrompt(items, deps.idioms),
            effort: 'medium',
            signal: abort.signal,
            emit: (event) => {
                if (event.kind === 'text') {
                    said += event.text;
                    deps.emit({ kind: 'text', text: event.text });
                }
                else if (event.kind === 'tool-start') {
                    if (EMBEDDED_WRITE_TOOL_NAMES.has(event.name))
                        publish({ phase: 'writing' });
                }
                else if (event.kind === 'tool-end') {
                    deps.emit({ kind: 'tool', name: event.name, summary: event.summary ?? event.name, ok: event.ok });
                    if (state.phase === 'writing')
                        publish({ phase: 'thinking' });
                }
            },
        });
        history = result.history;
        running = false;
        abort = null;
        if (result.outcome === 'done') {
            publish({ phase: 'done', lastText: said.trim(), lastRunItemIds: items.map((i) => i.id) });
        }
        else if (result.outcome === 'cancelled') {
            // A cancelled batch goes back to the front of the queue, untouched.
            state.queued.unshift(...items);
            publish({ phase: state.paused ? 'paused' : 'idle', lastText: said.trim(), message: 'Stopped.' });
        }
        else {
            publish({ phase: 'error', lastText: said.trim(), lastRunItemIds: items.map((i) => i.id), message: result.message ?? 'The agent stopped before it finished.' });
        }
        schedule();
    };
    return {
        state: () => ({ ...state, queued: [...state.queued] }),
        enqueue: (item) => {
            const at = state.queued.findIndex((q) => q.id === item.id);
            if (at === -1)
                state.queued.push(item);
            else
                state.queued[at] = item;
            publish({ phase: running ? state.phase : state.paused ? 'paused' : 'idle' });
            schedule();
        },
        remove: (id) => {
            state.queued = state.queued.filter((q) => q.id !== id);
            publish({});
            schedule();
        },
        setPaused: (paused) => {
            publish({ paused, phase: running ? state.phase : paused ? 'paused' : 'idle' });
            schedule();
        },
        runNow: () => {
            if (timer !== null)
                clearTimeout(timer);
            timer = null;
            void run();
        },
        cancel: () => abort?.abort(),
        designCheck: async () => {
            const provider = await deps.getProvider();
            if (provider === null) {
                deps.emit({ kind: 'report', markdown: 'Sign in to Scamp and connect the agent to run a design check.' });
                return;
            }
            if (running) {
                deps.emit({ kind: 'report', markdown: 'The agent is writing changes. Run the check when it finishes.' });
                return;
            }
            running = true;
            abort = new AbortController();
            publish({ phase: 'thinking', lastText: '', message: 'Checking the design…' });
            let said = '';
            // A check stands alone: it starts from no history and can only read.
            const result = await runTurn({
                provider,
                system: embeddedSystemPrompt(deps.folder, deps.idioms),
                tools: EMBEDDED_READ_TOOLS,
                invoke: invokerFor(new Set(), true),
                history: [],
                userContent: DESIGN_CHECK_PROMPT,
                effort: 'medium',
                maxSteps: 40,
                signal: abort.signal,
                emit: (event) => {
                    if (event.kind === 'text')
                        said += event.text;
                },
            });
            running = false;
            abort = null;
            deps.emit({ kind: 'report', markdown: said.trim().length > 0 ? said.trim() : result.message ?? 'The check found nothing to report.' });
            publish({ phase: result.outcome === 'done' ? 'done' : 'error', message: result.outcome === 'done' ? undefined : result.message });
            schedule();
        },
        touched: () => [...touched].sort(),
        clearTouched: (paths) => {
            if (paths === undefined)
                touched.clear();
            else
                paths.forEach((p) => touched.delete(p));
        },
        dispose: () => {
            if (timer !== null)
                clearTimeout(timer);
            abort?.abort();
        },
    };
};
