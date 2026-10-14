import { useCanvasStore } from '@store/canvasSlice';
import { DESIGN_MD_SECTIONS } from '@lib/designMd';

import styles from './DesignDocSection.module.css';

/**
 * The Design System documentation forms — the authored prose that Scamp
 * writes into DESIGN.md alongside the auto-generated token YAML. Bound
 * directly to the store's `designProse`; the debounced `useDesignMdSync`
 * coalesces edits into DESIGN.md writes, and reflects external edits back.
 * Only this component subscribes to `designProse`, so per-keystroke updates
 * don't re-render the rest of the panel. see docs/archive/2026-07-23-design-system-plan.md
 */
export const DesignDocSection = (): JSX.Element => {
  const designProse = useCanvasStore((s) => s.designProse);
  const setDesignProse = useCanvasStore((s) => s.setDesignProse);

  return (
    <section className={styles.section} data-theme-section="documentation">
      <h3 className={styles.sectionTitle}>Documentation</h3>
      <div className={styles.hint}>
        Written to <code>DESIGN.md</code> for agents. Token values are
        auto-generated from your theme; these fields are the human-readable
        rationale and usage guidance.
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Project name</span>
        <input
          type="text"
          className={styles.input}
          value={designProse.name ?? ''}
          data-testid="design-doc-name"
          onChange={(e) =>
            setDesignProse({ ...designProse, name: e.target.value })
          }
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea
          className={styles.textarea}
          value={designProse.description ?? ''}
          rows={2}
          placeholder="One-line summary of the product…"
          onChange={(e) =>
            setDesignProse({ ...designProse, description: e.target.value })
          }
        />
      </label>

      {DESIGN_MD_SECTIONS.map((title) => (
        <label key={title} className={styles.field}>
          <span className={styles.label}>{title}</span>
          <textarea
            className={styles.textarea}
            value={designProse.sections[title] ?? ''}
            rows={3}
            placeholder={`${title} guidance…`}
            data-design-doc-section={title}
            onChange={(e) =>
              setDesignProse({
                ...designProse,
                sections: { ...designProse.sections, [title]: e.target.value },
              })
            }
          />
        </label>
      ))}
    </section>
  );
};
