import { buildAgentPrompt, describeChange } from '@shared/embedded';
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
    let worker = 'scamp';
    let held = null;
    /** Run now, for the user's agent: the next take goes through even while paused. */
    let releaseOnce = false;
    let lastChange = 0;
    let runCount = 0;
    let heldRunId = null;
    /** Items written since the last accept or discard, for the commit message. */
    let doneItems = [];
    const nextRunId = () => `run-${Date.now().toString(36)}-${(runCount += 1)}`;
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
        lastChange = Date.now();
        // The user's agent takes batches itself (`takeBatch`); nothing runs here.
        if (worker === 'own' || state.paused || running || state.queued.length === 0)
            return;
        timer = setTimeout(() => {
            timer = null;
            void run();
        }, delay);
    };
    const run = async () => {
        if (running || state.queued.length === 0)
            return;
        // Claimed before the await, so a second call (the timer and Run now) can't start a run alongside this one.
        running = true;
        // Edits Scamp writes itself need no agent; the rest need one signed in.
        const provider = await deps.getProvider();
        if (provider === null && deps.writeDirect === undefined) {
            running = false;
            publish({ phase: 'error', message: 'Sign in to Scamp and connect the agent to write your changes.' });
            return;
        }
        const items = state.queued.splice(0);
        const runId = nextRunId();
        await deps.onRunStart?.(runId);
        abort = new AbortController();
        publish({ phase: 'thinking', lastText: '', message: undefined });
        let said = '';
        const written = new Set();
        const forAgent = [];
        for (const item of items) {
            const file = (await deps.writeDirect?.(item).catch(() => null)) ?? null;
            if (file === null)
                forAgent.push(item);
            else
                written.add(file);
        }
        written.forEach((f) => touched.add(f));
        if (written.size > 0) {
            said = `Scamp wrote ${items.length - forAgent.length === 1 ? 'this' : 'these'} directly, in ${[...written].join(', ')}.${forAgent.length > 0 ? ' The agent writes the rest.' : ''}\n\n`;
            deps.emit({ kind: 'text', text: said });
        }
        const result = forAgent.length === 0
            ? { outcome: 'done', history, message: undefined }
            : provider === null
                ? { outcome: 'error', history, message: 'Sign in to Scamp and connect the agent to write the rest of your changes.' }
                : await runTurn({
                    provider,
                    system: embeddedSystemPrompt(deps.folder, deps.idioms),
                    tools: EMBEDDED_TOOLS,
                    invoke: invokerFor(touched, false),
                    history,
                    userContent: buildAgentPrompt(forAgent, deps.idioms),
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
        await deps.onRunEnd?.(runId);
        running = false;
        abort = null;
        if (result.outcome === 'done') {
            doneItems = [...doneItems, ...items];
            publish({ phase: 'done', lastText: said.trim(), lastRunItemIds: items.map((i) => i.id), lastRunId: runId });
        }
        else if (result.outcome === 'cancelled') {
            // A cancelled batch goes back to the front of the queue; what it wrote can still be undone.
            state.queued.unshift(...items);
            publish({ phase: state.paused ? 'paused' : 'idle', lastText: said.trim(), message: 'Stopped.', lastRunId: runId, lastRunItemIds: [] });
        }
        else {
            doneItems = [...doneItems, ...items];
            publish({ phase: 'error', lastText: said.trim(), lastRunItemIds: items.map((i) => i.id), lastRunId: runId, message: result.message ?? 'The agent stopped before it finished.' });
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
            const had = state.queued.some((q) => q.id === id);
            state.queued = state.queued.filter((q) => q.id !== id);
            publish({});
            schedule();
            return had;
        },
        setPaused: (paused) => {
            publish({ paused, phase: running ? state.phase : paused ? 'paused' : 'idle' });
            schedule();
        },
        runNow: () => {
            if (timer !== null)
                clearTimeout(timer);
            timer = null;
            if (worker === 'own')
                releaseOnce = true;
            else
                void run();
        },
        cancel: () => {
            if (held !== null) {
                // The user's agent may still be writing; the batch goes back so nothing is lost.
                state.queued.unshift(...held);
                held = null;
                running = false;
                const runId = heldRunId;
                heldRunId = null;
                publish({ phase: state.paused ? 'paused' : 'idle', message: 'Stopped. Your agent may have written part of it: check the diff.', lastRunItemIds: [] });
                if (runId !== null)
                    void deps.onRunEnd?.(runId).then(() => publish({ lastRunId: runId }));
                schedule();
                return;
            }
            abort?.abort();
        },
        designCheck: async () => {
            const provider = await deps.getProvider();
            if (provider === null) {
                deps.emit({
                    kind: 'report',
                    markdown: worker === 'own'
                        ? 'Design checks run on the Scamp Agent, which needs an Anthropic key. Your own agent can review the design if you ask it directly.'
                        : 'Sign in to Scamp and connect the agent to run a design check.',
                });
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
            if (paths === undefined) {
                touched.clear();
                doneItems = [];
            }
            else
                paths.forEach((p) => touched.delete(p));
        },
        addTouched: (paths) => paths.forEach((p) => touched.add(p)),
        doneSummary: () => doneItems.map(describeChange),
        dispose: () => {
            if (timer !== null)
                clearTimeout(timer);
            abort?.abort();
        },
        worker: () => worker,
        setWorker: (next) => {
            if (next === worker || running)
                return;
            worker = next;
            schedule();
        },
        takeBatch: async (timeoutMs) => {
            const until = Date.now() + timeoutMs;
            const ready = () => worker === 'own' && !running && state.queued.length > 0 && (!state.paused || releaseOnce) && (releaseOnce || Date.now() - lastChange >= delay);
            while (!ready()) {
                if (Date.now() >= until)
                    return null;
                await new Promise((r) => setTimeout(r, 200));
            }
            releaseOnce = false;
            running = true;
            const taken = state.queued.splice(0);
            held = taken;
            heldRunId = nextRunId();
            await deps.onRunStart?.(heldRunId);
            publish({ phase: 'writing', lastText: '', message: 'Your agent is writing these changes.' });
            return taken;
        },
        finishBatch: async (summary, files) => {
            if (held === null)
                return false;
            const items = held;
            const runId = heldRunId;
            held = null;
            heldRunId = null;
            files.forEach((f) => touched.add(f));
            if (runId !== null)
                await deps.onRunEnd?.(runId);
            running = false;
            doneItems = [...doneItems, ...items];
            publish({ phase: 'done', lastText: summary.trim(), lastRunItemIds: items.map((i) => i.id), lastRunId: runId ?? undefined, message: undefined });
            schedule();
            return true;
        },
        heldBatch: () => held,
    };
};
