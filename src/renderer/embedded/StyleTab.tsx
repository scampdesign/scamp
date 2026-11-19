import { useState } from 'react';
import { IconArrowBarUp, IconBoxMargin, IconCopy, IconTrash } from '@tabler/icons-react';

import { scopeWords } from '@shared/embedded';
import type { EmbeddedPseudoState } from '@shared/types';

import { Tooltip } from '../src/components/controls/Tooltip';
import { UiPanel } from '../src/components/UiPanel';
import { CodeSection } from './CodeSection';
import { ContentSection } from './ContentSection';
import { IconButton } from './IconButton';
import { useEmbeddedStore } from './embeddedStore';
import { selectParent, sendInstruction, setPseudo, setScope, structureEdit } from './session';
import styles from './StyleTab.module.css';

const STATES: ReadonlyArray<{ state: EmbeddedPseudoState; label: string }> = [
  { state: 'none', label: 'Default' },
  { state: 'hover', label: 'Hover' },
  { state: 'focus', label: 'Focus' },
  { state: 'active', label: 'Active' },
];

/** The selected element: where it's written, how far an edit reaches, and Scamp's panel. */
export const StyleTab = (): JSX.Element => {
  const selection = useEmbeddedStore((s) => s.selection);
  const scope = useEmbeddedStore((s) => s.scope);
  const edit = useEmbeddedStore((s) => s.edit);
  const pending = useEmbeddedStore((s) => s.pending);
  const pseudo = useEmbeddedStore((s) => s.pseudo);
  const resolving = useEmbeddedStore((s) => s.resolving);
  const dragNote = useEmbeddedStore((s) => s.dragNote);
  const [instruction, setInstruction] = useState('');

  const handleSend = async (): Promise<void> => {
    await sendInstruction(instruction);
    setInstruction('');
  };

  const ask = (
    <form
      className={styles.ask}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSend();
      }}
    >
      <textarea
        className={styles.askInput}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={selection !== null ? 'Tell the agent how to change this, such as “match the primary button”' : 'Tell the agent what to change on this page'}
        rows={3}
        data-testid="embedded-instruction"
      />
      <button type="submit" className={styles.askButton} disabled={instruction.trim().length === 0}>
        Ask the agent
      </button>
    </form>
  );

  if (selection === null) {
    return (
      <div className={styles.tab}>
        <p className={styles.hint}>
          {edit ? 'Click an element in your app to style it.' : 'Turn on Edit, then click an element in your app to style it.'}
        </p>
        {ask}
      </div>
    );
  }
  const { element } = selection;
  const words = scopeWords(element);
  return (
    <div className={styles.tab} data-testid="embedded-style-tab">
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <div className={styles.tag}>
            &lt;{element.tag}&gt;{element.components[0] !== undefined && <span className={styles.component}> in {element.components[0]}</span>}
          </div>
          <div className={styles.actions}>
            <IconButton icon={IconArrowBarUp} variant="bare" label="Select parent" tooltip="Select parent — Select the element this one is inside, to style or move it" onClick={selectParent} testId="embedded-select-parent" />
            <IconButton icon={IconCopy} variant="bare" label="Duplicate" tooltip="Duplicate — Cmd+D" onClick={() => void structureEdit('duplicate')} testId="embedded-duplicate" />
            <IconButton icon={IconBoxMargin} variant="bare" label="Wrap in a container" onClick={() => void structureEdit('wrap')} testId="embedded-wrap" />
            <IconButton icon={IconTrash} variant="bare" label="Delete" tooltip="Delete — Delete key" onClick={() => void structureEdit('delete')} testId="embedded-delete" />
          </div>
        </div>
        {element.source !== null && <code className={styles.source} data-testid="embedded-source">{element.source}</code>}
        {element.source === null && resolving && <span className={styles.source}>Finding source…</span>}
        {element.source === null && !resolving && (
          <p className={styles.note} data-testid="embedded-source-note">
            {element.library !== null
              ? `Drawn by ${element.library}. Your edits go to the agent, which styles it from your code that uses it.`
              : 'Scamp couldn’t map this to a line. Your edits still work: the agent finds the element from its classes, text and components.'}
          </p>
        )}
        {element.instanceCount > 1 && (
          <div className={styles.scope} role="group" aria-label="Which instances this edit changes">
            <Tooltip label={words.oneTip}>
              <button type="button" aria-pressed={scope === 'instance'} onClick={() => setScope('instance')} data-testid="embedded-scope-one">
                {words.one}
              </button>
            </Tooltip>
            <Tooltip label={words.everyTip}>
              <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')} data-testid="embedded-scope-all">
                {words.every}
              </button>
            </Tooltip>
          </div>
        )}
        <div className={styles.scope} role="group" aria-label="Which state of the element to show and style" data-testid="embedded-states">
          {STATES.map(({ state, label }) => (
            <button key={state} type="button" aria-pressed={pseudo === state} onClick={() => setPseudo(state)} data-testid={`embedded-state-${state}`}>
              {label}
            </button>
          ))}
        </div>
        {selection.also.length > 0 && (
          <div className={styles.stateNote} data-testid="embedded-also">
            {selection.also.length + 1} elements selected. Edits reach all of them; the panel shows the first.
          </div>
        )}
        {pseudo !== 'none' && (
          <div className={styles.stateNote}>Showing :{pseudo}. Edits style this state only.</div>
        )}
        {dragNote !== null && (
          <p className={styles.note} role="status" data-testid="embedded-drag-note">
            {dragNote}
          </p>
        )}
        {pending !== null && pending.changes.length > 0 && (
          <div className={styles.pending} data-testid="embedded-pending">
            {pending.changes.map((c) => `${c.property}: ${c.to}`).join(' · ')}
          </div>
        )}
      </div>
      {/* The app's own panel wrapper, so it's found the same way in both windows. */}
      <ContentSection />
      <div data-testid="properties-panel">
        <UiPanel />
      </div>
      <CodeSection />
      {ask}
    </div>
  );
};
