import { useState } from 'react';

import type { EmbeddedPseudoState } from '@shared/types';

import { UiPanel } from '../src/components/UiPanel';
import { useEmbeddedStore } from './embeddedStore';
import { sendInstruction, setPseudo, setScope } from './session';
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
  return (
    <div className={styles.tab} data-testid="embedded-style-tab">
      <div className={styles.head}>
        <div className={styles.tag}>
          &lt;{element.tag}&gt;{element.components[0] !== undefined && <span className={styles.component}> in {element.components[0]}</span>}
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
            <button type="button" aria-pressed={scope === 'instance'} onClick={() => setScope('instance')}>
              This one
            </button>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')} data-testid="embedded-scope-all">
              All {element.instanceCount}
            </button>
          </div>
        )}
        <div className={styles.scope} role="group" aria-label="Which state of the element to show and style" data-testid="embedded-states">
          {STATES.map(({ state, label }) => (
            <button key={state} type="button" aria-pressed={pseudo === state} onClick={() => setPseudo(state)} data-testid={`embedded-state-${state}`}>
              {label}
            </button>
          ))}
        </div>
        {pseudo !== 'none' && (
          <div className={styles.stateNote}>Showing :{pseudo}. Edits style this state only.</div>
        )}
        {pending !== null && pending.changes.length > 0 && (
          <div className={styles.pending} data-testid="embedded-pending">
            {pending.changes.map((c) => `${c.property}: ${c.to}`).join(' · ')}
          </div>
        )}
      </div>
      {/* The app's own panel wrapper, so it's found the same way in both windows. */}
      <div data-testid="properties-panel">
        <UiPanel />
      </div>
      {ask}
    </div>
  );
};
