import { useState } from 'react';

import { UiPanel } from '../src/components/UiPanel';
import { useEmbeddedStore } from './embeddedStore';
import { sendInstruction, setScope } from './session';
import styles from './StyleTab.module.css';

/** The selected element: where it's written, how far an edit reaches, and Scamp's panel. */
export const StyleTab = (): JSX.Element => {
  const selection = useEmbeddedStore((s) => s.selection);
  const scope = useEmbeddedStore((s) => s.scope);
  const edit = useEmbeddedStore((s) => s.edit);
  const pending = useEmbeddedStore((s) => s.pending);
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
        {pending !== null && pending.changes.length > 0 && (
          <div className={styles.pending} data-testid="embedded-pending">
            {pending.changes.map((c) => `${c.property}: ${c.to}`).join(' · ')}
          </div>
        )}
      </div>
      {element.unmappable !== null ? (
        <p className={styles.notice}>{element.unmappable}</p>
      ) : (
        // The app's own panel wrapper, so it's found the same way in both windows.
        <div data-testid="properties-panel">
          <UiPanel />
        </div>
      )}
      {ask}
    </div>
  );
};
