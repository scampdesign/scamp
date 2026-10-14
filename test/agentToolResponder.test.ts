import { describe, it, expect, beforeEach } from 'vitest';

import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { useAgentStore } from '@store/agentSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import {
  endAgentTurnHistory,
  executeAgentEdit,
} from '../src/renderer/src/syncBridge/agentToolResponder';

/**
 * The Scamp Agent's edits against the real stores: they land in the
 * canvas, and one turn's edits undo as one step.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

const TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="a1b2" className={styles.card_a1b2}>
    <p data-scamp-id="e5f6" className={styles.text_e5f6}>Body</p>
  </div>
</div>`;
const CSS = `.card_a1b2 { display: flex; gap: 8px; }`;

beforeEach(() => {
  useHistoryStore.setState({
    perPage: {},
    activePageId: null,
    transactionDepth: 0,
    pendingExternalEdit: null,
    restoreSnapshot: null,
  });
  useHistoryStore.getState().setRestoreSnapshot((snapshot) => {
    useCanvasStore.setState({ elements: snapshot });
  });
  useCanvasStore.setState({
    projectPath: '/project',
    elements: parseCode(TSX, CSS).elements,
    rootElementId: 'root',
    breakpoints: DEFAULT_BREAKPOINTS,
    themeTokens: [],
    snapshotPreview: null,
    activeComponent: null,
    selectedElementIds: [],
    componentTrees: {},
  });
  const history = useHistoryStore.getState();
  history.setActivePageId('home.tsx');
  history.commitInitialIfEmpty(useCanvasStore.getState().elements);
});

type ViewFile = { name: string; kind: 'view' | 'component'; tsxPath: string; cssPath: string; tsxContent: string; cssContent: string };

/** Views and components on "disk", for edits to ones that aren't open. */
const disk: Record<string, ViewFile> = {};

const putOnDisk = (name: string, kind: 'view' | 'component', tsx: string, css: string): void => {
  const parsed = parseCode(tsx, css, { isComponent: true });
  const code = generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: name, cssModuleImportName: name, isComponent: true });
  const folder = kind === 'view' ? 'views' : 'components';
  disk[name] = {
    name,
    kind,
    tsxPath: `/project/${folder}/${name}/${name}.tsx`,
    cssPath: `/project/${folder}/${name}/${name}.module.css`,
    tsxContent: code.tsx,
    cssContent: code.css,
  };
  const store = useCanvasStore.getState();
  store.setComponentTrees({ ...store.componentTrees, [name]: { elements: parsed.elements, rootId: parsed.rootId, kind } });
};

const treeOnDisk = (name: string): ReturnType<typeof parseCode>['elements'] => {
  const file = disk[name];
  if (file === undefined) throw new Error(`${name} is not on disk`);
  return parseCode(file.tsxContent, file.cssContent, { isComponent: true }).elements;
};

/** The few main-process calls these edits make, recorded. */
const calls: string[] = [];
let themeOnDisk = ':root {\n  --color-text: #111111;\n}\n';
(globalThis as { window?: unknown }).window = {
  scamp: {
    readTheme: async (): Promise<string> => themeOnDisk,
    writeTheme: async ({ content }: { content: string }): Promise<void> => {
      calls.push('writeTheme');
      themeOnDisk = content;
    },
    createComponent: async ({ componentName }: { componentName: string }): Promise<{ name: string }> => {
      calls.push(`createComponent ${componentName}`);
      return { name: componentName };
    },
    readComponent: async ({ componentName }: { componentName: string }): Promise<ViewFile | null> => {
      calls.push(`readComponent ${componentName}`);
      return disk[componentName] ?? null;
    },
    writeFile: async (args: {
      tsxPath: string;
      tsxContent: string;
      cssContent: string;
      expectedTsxContent?: string;
      expectedCssContent?: string;
    }): Promise<{ ok: true; writeId: string } | { ok: false; conflict: { actualTsxContent: string; actualCssContent: string } }> => {
      const file = Object.values(disk).find((f) => f.tsxPath === args.tsxPath);
      if (file === undefined) throw new Error(`no file at ${args.tsxPath}`);
      calls.push(`writeFile ${file.name}`);
      if (args.expectedTsxContent !== file.tsxContent || args.expectedCssContent !== file.cssContent) {
        return { ok: false, conflict: { actualTsxContent: file.tsxContent, actualCssContent: file.cssContent } };
      }
      disk[file.name] = { ...file, tsxContent: args.tsxContent, cssContent: args.cssContent };
      return { ok: true, writeId: 'w1' };
    },
  },
};

const entries = (): number => useHistoryStore.getState().perPage['home.tsx']?.entries.length ?? 0;

describe('executeAgentEdit', () => {
  it('applies an edit to the canvas and says what changed', async () => {
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'card_a1b2', set: 'gap: 24px' }, 't1');
    expect(answer.ok).toBe(true);
    expect(answer.summary).toBe('Updated card_a1b2 — gap: 24px;');
    expect(answer.text).toContain('Touched: card_a1b2 (id a1b2)');
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(24);
    endAgentTurnHistory('t1');
  });

  it('undoes every edit from one turn in a single step', async () => {
    const before = entries();
    await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 24px' }, 't1');
    await executeAgentEdit('scamp_set_text', { element: 'e5f6', text: 'Changed' }, 't1');
    await executeAgentEdit('scamp_set_tag', { element: 'a1b2', tag: 'section' }, 't1');
    endAgentTurnHistory('t1');

    expect(entries()).toBe(before + 1);
    const last = useHistoryStore.getState().perPage['home.tsx']?.entries.at(-1);
    expect(last?.kind).toBe('agent-edit');

    useHistoryStore.getState().undo();
    const elements = useCanvasStore.getState().elements;
    expect(elements['a1b2']?.gap).toBe(8);
    expect(elements['a1b2']?.tag).not.toBe('section');
    expect(elements['e5f6']?.text).toBe('Body');
  });

  it('keeps two turns as two undo steps', async () => {
    const before = entries();
    await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 24px' }, 't1');
    endAgentTurnHistory('t1');
    await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 32px' }, 't2');
    endAgentTurnHistory('t2');
    expect(entries()).toBe(before + 2);
    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(24);
  });

  it('leaves no transaction open when a turn makes no edit', async () => {
    endAgentTurnHistory('never-edited');
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });

  it('reports a failed edit without touching the canvas or history', async () => {
    const before = useCanvasStore.getState().elements;
    const answer = await executeAgentEdit('scamp_set_text', { element: 'a1b2', text: 'x' }, 't1');
    expect(answer.ok).toBe(false);
    expect(useCanvasStore.getState().elements).toBe(before);
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });

  it('refuses to edit while a snapshot preview is showing', async () => {
    useCanvasStore.setState({
      snapshotPreview: {} as NonNullable<ReturnType<typeof useCanvasStore.getState>['snapshotPreview']>,
    });
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'gap: 1px' }, 't1');
    expect(answer).toMatchObject({ ok: false });
    expect(answer.text).toContain('snapshot preview');
  });

  it('refuses an edit it does not know', async () => {
    expect(await executeAgentEdit('scamp_delete_everything', {}, 't1')).toMatchObject({ ok: false });
  });

  it('passes on what Scamp’s checks found on the touched element', async () => {
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'a1b2', set: 'color: var(--nowhere)' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.text).toContain('Check: card_a1b2');
    expect(answer.text).toContain('--nowhere');
  });
});

describe('theme tokens', () => {
  it('writes them to theme.css and the store, outside the undo stack', async () => {
    calls.length = 0;
    const answer = await executeAgentEdit('scamp_set_theme_tokens', { tokens: { '--color-accent': '#ff6600' } }, 't1');
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, summary: 'Theme tokens — added --color-accent' });
    expect(answer.text).toContain('Undo AI changes');
    expect(calls).toEqual(['writeTheme']);
    expect(themeOnDisk).toContain('--color-accent: #ff6600');
    expect(themeOnDisk).toContain('--color-text: #111111');
    expect(useCanvasStore.getState().themeTokens.map((t) => t.name)).toContain('--color-accent');
  });

  it('writes nothing when every value is already set', async () => {
    calls.length = 0;
    const answer = await executeAgentEdit('scamp_set_theme_tokens', { tokens: { '--color-text': '#111111' } }, 't1');
    expect(answer.ok).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('extract component', () => {
  it('creates the component, swaps in an instance, and reports it for undo', async () => {
    calls.length = 0;
    const before = entries();
    const answer = await executeAgentEdit('scamp_extract_component', { element: 'card_a1b2', name: 'Card' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, createdComponent: 'Card' });
    expect(answer.summary).toBe('Made card_a1b2 into the component Card');
    expect(calls).toEqual(['createComponent Card']);
    const state = useCanvasStore.getState();
    expect(state.componentTrees['Card']).toBeDefined();
    const instances = Object.values(state.elements).filter((el) => el.type === 'component-instance');
    expect(instances.map((el) => el.componentName)).toEqual(['Card']);
    expect(state.elements['e5f6']).toBeUndefined();
    // One undo step, which brings the original back.
    expect(entries()).toBe(before + 1);
    useHistoryStore.getState().undo();
    expect(useCanvasStore.getState().elements['e5f6']?.text).toBe('Body');
  });

  it('writes nothing for a plan it refuses', async () => {
    calls.length = 0;
    const answer = await executeAgentEdit('scamp_extract_component', { element: 'card_a1b2', name: 'card' }, 't1');
    expect(answer.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('edits to a view that isn’t open', () => {
  const SETTINGS_TSX = `<div data-scamp-id="root" className={styles.root}>
  <a data-scamp-id="c3d4" className={styles.skip_c3d4} href="#main">Skip to content</a>
  <div data-scamp-id="d4e5" className={styles.main_d4e5}>
    <p data-scamp-id="f6a7" className={styles.text_f6a7}>Settings</p>
  </div>
</div>`;
  const SETTINGS_CSS = `.main_d4e5 { width: 1208px; height: 900px; }`;

  beforeEach(() => {
    calls.length = 0;
    for (const name of Object.keys(disk)) delete disk[name];
    putOnDisk('Settings', 'view', SETTINGS_TSX, SETTINGS_CSS);
    useAgentStore.setState({ runningTurn: null });
  });

  it('edits the named view’s files and leaves the canvas and its undo stack alone', async () => {
    const canvasBefore = useCanvasStore.getState().elements;
    const historyBefore = entries();
    const answer = await executeAgentEdit(
      'scamp_set_styles',
      { view: 'Settings', element: 'main_d4e5', remove: ['width', 'height'], set: 'min-width: 0' },
      't1'
    );
    endAgentTurnHistory('t1');

    expect(answer).toMatchObject({ ok: true, refreshProject: true });
    expect(answer.summary).toMatch(/^Settings: /);
    expect(answer.text).toContain('Undo AI changes');
    expect(disk['Settings']?.cssContent).toContain('min-width: 0');
    expect(disk['Settings']?.cssContent).not.toContain('1208px');
    // What the read tools answer from follows the files.
    expect(useCanvasStore.getState().componentTrees['Settings']?.elements).toEqual(treeOnDisk('Settings'));
    expect(useCanvasStore.getState().elements).toBe(canvasBefore);
    expect(entries()).toBe(historyBefore);
  });

  it('builds each of a turn’s edits on the one before, even when they arrive together', async () => {
    const answers = await Promise.all([
      executeAgentEdit('scamp_set_text', { view: 'Settings', element: 'f6a7', text: 'Account' }, 't1'),
      executeAgentEdit('scamp_set_styles', { view: 'Settings', element: 'd4e5', set: 'gap: 12px' }, 't1'),
      executeAgentEdit('scamp_set_tag', { view: 'Settings', element: 'd4e5', tag: 'main' }, 't1'),
    ]);
    endAgentTurnHistory('t1');

    expect(answers.map((a) => a.ok)).toEqual([true, true, true]);
    // Read once, written three times — each write claiming the last one's content.
    expect(calls).toEqual(['readComponent Settings', 'writeFile Settings', 'writeFile Settings', 'writeFile Settings']);
    const tree = treeOnDisk('Settings');
    expect(tree['f6a7']?.text).toBe('Account');
    expect(tree['d4e5']?.gap).toBe(12);
    expect(tree['d4e5']?.tag).toBe('main');
  });

  it('deletes an element on another view', async () => {
    const answer = await executeAgentEdit('scamp_delete_element', { view: 'Settings', element: 'skip_c3d4' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.ok).toBe(true);
    expect(treeOnDisk('Settings')['c3d4']).toBeUndefined();
  });

  it('refuses an edit when the file changed behind it, and reads it again next time', async () => {
    await executeAgentEdit('scamp_set_styles', { view: 'Settings', element: 'd4e5', set: 'gap: 4px' }, 't1');
    const file = disk['Settings'];
    if (file === undefined) throw new Error('missing');
    // Someone else styles another element in the meantime.
    disk['Settings'] = { ...file, cssContent: file.cssContent.replace('.text_f6a7 {', '.text_f6a7 {\n  color: red;') };

    const refused = await executeAgentEdit('scamp_set_styles', { view: 'Settings', element: 'd4e5', set: 'gap: 8px' }, 't1');
    expect(refused.ok).toBe(false);
    expect(refused.text).toContain('changed on disk');

    const retried = await executeAgentEdit('scamp_set_styles', { view: 'Settings', element: 'd4e5', set: 'gap: 8px' }, 't1');
    endAgentTurnHistory('t1');
    expect(retried.ok).toBe(true);
    expect(treeOnDisk('Settings')['f6a7']?.color).toBe('red');
    expect(treeOnDisk('Settings')['d4e5']?.gap).toBe(8);
  });

  it('says which names exist when the view isn’t one', async () => {
    const answer = await executeAgentEdit('scamp_set_styles', { view: 'Nowhere', element: 'd4e5', set: 'gap: 4px' }, 't1');
    expect(answer.ok).toBe(false);
    expect(answer.text).toContain('scamp_list_pages');
    expect(calls).toEqual([]);
  });

  it('reports a bad element in another view without writing', async () => {
    const answer = await executeAgentEdit('scamp_set_text', { view: 'Settings', element: 'nope', text: 'x' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.ok).toBe(false);
    expect(calls).toEqual(['readComponent Settings']);
  });

  it('finishes the conversation’s own view in its files after the user opens another', async () => {
    useAgentStore.setState({ runningTurn: { turnId: 't9', conversation: { kind: 'view', name: 'Settings' } } });
    const answer = await executeAgentEdit('scamp_set_styles', { element: 'd4e5', set: 'gap: 2px' }, 't9');
    endAgentTurnHistory('t9');
    expect(answer.ok).toBe(true);
    expect(treeOnDisk('Settings')['d4e5']?.gap).toBe(2);
  });

  it('edits the canvas when the named view is the open one', async () => {
    useCanvasStore.setState({
      activeComponent: { name: 'Home', kind: 'view', tsxPath: '/project/views/Home/Home.tsx', cssPath: '/project/views/Home/Home.module.css' },
      componentTrees: { ...useCanvasStore.getState().componentTrees, Home: { elements: {}, rootId: 'root', kind: 'view' } },
    });
    const answer = await executeAgentEdit('scamp_set_styles', { view: 'Home', element: 'a1b2', set: 'gap: 40px' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.ok).toBe(true);
    expect(useCanvasStore.getState().elements['a1b2']?.gap).toBe(40);
    expect(calls).toEqual([]);
  });

  it('puts an existing component in place of a container on another view', async () => {
    putOnDisk('Shell', 'component', '<div data-scamp-id="root" className={styles.root}></div>', '');
    const answer = await executeAgentEdit(
      'scamp_use_component',
      { view: 'Settings', element: 'main_d4e5', component: 'Shell' },
      't1'
    );
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, summary: 'Settings: replaced main_d4e5 with Shell' });
    const instances = Object.values(treeOnDisk('Settings')).filter((el) => el.type === 'component-instance');
    expect(instances.map((el) => el.componentName)).toEqual(['Shell']);
  });

  it('refuses a component that doesn’t exist, naming the ones that do', async () => {
    putOnDisk('Shell', 'component', '<div data-scamp-id="root" className={styles.root}></div>', '');
    const answer = await executeAgentEdit('scamp_use_component', { view: 'Settings', element: 'd4e5', component: 'Header' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer.ok).toBe(false);
    expect(answer.text).toContain('Shell');
  });

  it('extracts a component from another view and swaps it in there', async () => {
    const answer = await executeAgentEdit('scamp_extract_component', { view: 'Settings', element: 'main_d4e5', name: 'Panel' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, createdComponent: 'Panel', refreshProject: true });
    expect(calls).toContain('createComponent Panel');
    expect(useCanvasStore.getState().componentTrees['Panel']?.kind).toBe('component');
    const instances = Object.values(treeOnDisk('Settings')).filter((el) => el.type === 'component-instance');
    expect(instances.map((el) => el.componentName)).toEqual(['Panel']);
  });
});

describe('use component on the canvas', () => {
  it('replaces the container with an instance, as one undo step', async () => {
    useCanvasStore.setState({
      componentTrees: { Shell: { elements: {}, rootId: 'root', kind: 'component' } },
    });
    const before = entries();
    const answer = await executeAgentEdit('scamp_use_component', { element: 'card_a1b2', component: 'shell' }, 't1');
    endAgentTurnHistory('t1');
    expect(answer).toMatchObject({ ok: true, summary: 'Replaced card_a1b2 with Shell' });
    const instances = Object.values(useCanvasStore.getState().elements).filter((el) => el.type === 'component-instance');
    expect(instances.map((el) => el.componentName)).toEqual(['Shell']);
    expect(entries()).toBe(before + 1);
  });
});
