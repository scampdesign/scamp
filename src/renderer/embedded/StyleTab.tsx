import { useState } from 'react';
import { IconArrowBarUp, IconBoxMargin, IconCopy, IconTrash } from '@tabler/icons-react';

import { scopeWords } from '@shared/embedded';
import type { EmbeddedPseudoState } from '@shared/types';

import { SegmentedControl } from '../src/components/controls/SegmentedControl';
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
  const component = element.components[0];
  return (
    <div className={styles.tab} data-testid="embedded-style-tab">
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <span className={styles.tag}>&lt;{element.tag}&gt;</span>
          <div className={styles.actions}>
            <IconButton icon={IconArrowBarUp} variant="bare" label="Select parent" tooltip="Select parent — Select the element this one is inside, to style or move it" onClick={selectParent} testId="embedded-select-parent" />
            <IconButton icon={IconCopy} variant="bare" label="Duplicate" tooltip="Duplicate — Cmd+D" onClick={() => void structureEdit('duplicate')} testId="embedded-duplicate" />
            <IconButton icon={IconBoxMargin} variant="bare" label="Wrap in a container" onClick={() => void structureEdit('wrap')} testId="embedded-wrap" />
            <IconButton icon={IconTrash} variant="bare" label="Delete" tooltip="Delete — Delete key" onClick={() => void structureEdit('delete')} testId="embedded-delete" />
          </div>
        </div>
        {component !== undefined && (
          <Tooltip label={`In ${component}`}>
            <div className={styles.owner} data-testid="embedded-element-component">
              in <span className={styles.component}>{component}</span>
            </div>
          </Tooltip>
        )}
        {element.source !== null && <code className={styles.source} data-testid="embedded-source">{element.source}</code>}
        {element.source === null && resolving && <span className={styles.source}>Finding source…</span>}
        {element.source === null && !resolving && (
          <p className={styles.note} data-testid="embedded-source-note">
            {element.library !== null
              ? `Drawn by ${element.library}. Your edits go to the agent, which styles it from your code that uses it.`
              : 'Scamp couldn’t map this to a line. Your edits still work: the agent finds the element from its classes, text and components.'}
          </p>
        )}
        <div className={styles.controls}>
          {element.instanceCount > 1 && (
            <>
              <span className={styles.label}>Apply to</span>
              <SegmentedControl
                value={scope}
                onChange={setScope}
                ariaLabel="Which instances this edit changes"
                options={[
                  { value: 'instance', label: words.one, testId: 'embedded-scope-one' },
                  { value: 'all', label: words.every, testId: 'embedded-scope-all' },
                ]}
              />
              <p className={styles.scopeNote} data-testid="embedded-scope-note">
                {scope === 'all' ? words.everyNote : words.oneNote}
              </p>
            </>
          )}
          <span className={styles.label}>State</span>
          <SegmentedControl
            value={pseudo}
            onChange={setPseudo}
            ariaLabel="Which state of the element to show and style"
            testId="embedded-states"
            options={STATES.map(({ state, label }) => ({ value: state, label, testId: `embedded-state-${state}` }))}
          />
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
