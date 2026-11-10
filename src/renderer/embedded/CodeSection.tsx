import { useEffect, useState } from 'react';

import type { EmbeddedSourceLines } from '@shared/types';

import { useEmbeddedStore } from './embeddedStore';
import styles from './CodeSection.module.css';

/** A rule's text, one declaration a line. */
const pretty = (css: string): string => css.replace(/\{\s*/, '{\n  ').replace(/;\s*(?!$)/g, ';\n  ').replace(/\s*\}$/, '\n}');

/**
 * The selection's JSX and the CSS rules that style it, read-only, at the
 * bottom of the Style tab. see docs/plans/embedded-canvas-gaps.md (gap 14)
 */
export const CodeSection = (): JSX.Element | null => {
  const selection = useEmbeddedStore((s) => s.selection);
  const [open, setOpen] = useState(false);
  const [jsx, setJsx] = useState<EmbeddedSourceLines | null>(null);
  const source = selection?.element.source ?? null;

  useEffect(() => {
    setJsx(null);
    if (!open || source === null) return;
    let live = true;
    void window.scampEmbedded.readSource(source).then((found) => {
      if (live) setJsx(found);
    });
    return () => {
      live = false;
    };
  }, [open, source]);

  if (selection === null) return null;
  return (
    <details className={styles.section} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="embedded-code">
      <summary className={styles.title}>Code</summary>
      {jsx !== null && (
        <figure className={styles.block}>
          <figcaption className={styles.caption}>{jsx.file}</figcaption>
          <pre className={styles.code} data-testid="embedded-code-jsx">
            {jsx.lines.map((line, i) => (
              <span key={i} className={styles.line}>
                <span className={styles.number}>{jsx.start + i}</span>
                {line}
              </span>
            ))}
          </pre>
        </figure>
      )}
      {source === null && <p className={styles.note}>Scamp couldn’t map this element to a line.</p>}
      {selection.rules.length === 0 && <p className={styles.note}>No CSS rules match this element.</p>}
      {selection.rules.map((rule, i) => (
        <figure key={i} className={styles.block}>
          <figcaption className={styles.caption}>{rule.sheet}</figcaption>
          <pre className={styles.code} data-testid="embedded-code-rule">
            {pretty(rule.text)}
          </pre>
        </figure>
      ))}
    </details>
  );
};
