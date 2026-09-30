import { useMemo } from 'react';

import { ROOT_ELEMENT_ID } from '@lib/element';
import { lintView, type ViewFinding } from '@lib/viewLint';
import { useCanvasStore } from '@store/canvasSlice';

import { Section } from '../sections/Section';
import styles from './ChecksSection.module.css';

/**
 * What the open view got wrong, where the person who has to fix it can
 * see it.
 *
 * `lintView` has existed for a while and had no human-facing surface at
 * all — it was reachable only through the MCP snapshot, so an agent
 * could ask and a person could not. A reviewed project had **6,339
 * undeclared tokens across 60 screens** and nothing anywhere said so;
 * every colour in it resolved to nothing and the screens came out
 * monochrome. The user found out by looking at them.
 *
 * One view's findings, not the project's: these are computed from the
 * canvas store, which holds the open view and nothing else. A
 * project-wide count would mean parsing 60 files on every render.
 * see docs/notes/agent-authored-views-review.md
 */

/** One line per kind, in the order a person should care about them. */
const KIND_ORDER: ReadonlyArray<ViewFinding['kind']> = [
  'marker-leaked',
  'undeclared-token',
  'binding-not-parsed',
  'missing-sample',
  'not-panel-editable',
  'side-not-typed',
  'raw-text-fragment',
  'repeat-rows-differ',
];

/** A heading for a run of findings of one kind. */
const KIND_LABEL: Readonly<Record<ViewFinding['kind'], string>> = {
  'marker-leaked': 'Bindings that failed to parse',
  'undeclared-token': 'Tokens this project never declares',
  'binding-not-parsed': 'Bindings Scamp could not read',
  'missing-sample': 'Bound values with no sample',
  'not-panel-editable': 'Values the panel cannot edit',
  'side-not-typed': 'One-sided values the panel cannot edit',
  'raw-text-fragment': 'Text outside a text element',
  'repeat-rows-differ': 'Repeat rows that are not alike',
};

/** How many of each kind to list before saying "and N more". */
const MAX_PER_KIND = 6;

export const ChecksSection = (): JSX.Element | null => {
  const elements = useCanvasStore((s) => s.elements);
  const themeTokens = useCanvasStore((s) => s.themeTokens);
  const selectElement = useCanvasStore((s) => s.selectElement);

  // Memoised on the identity of what it reads: a lint over a few
  // thousand elements on every keystroke would be felt.
  const findings = useMemo(() => {
    const names = themeTokens.map((token) => token.name);
    try {
      return lintView({ elements, rootId: ROOT_ELEMENT_ID, themeTokens: names });
    } catch {
      // A findings panel must never be the thing that breaks the panel.
      return [];
    }
  }, [elements, themeTokens]);

  if (findings.length === 0) return null;

  const byKind = new Map<ViewFinding['kind'], ViewFinding[]>();
  for (const finding of findings) {
    const list = byKind.get(finding.kind);
    if (list === undefined) byKind.set(finding.kind, [finding]);
    else list.push(finding);
  }
  const kinds = KIND_ORDER.filter((kind) => byKind.has(kind));

  return (
    <div data-testid="checks-section">
      {/* Open by default: a collapsed warning is a warning nobody
          reads, and this exists because nothing was saying anything. */}
      <Section title="Checks" collapsible defaultOpen count={findings.length}>
        <ul className={styles.list}>
          {kinds.map((kind) => {
            const list = byKind.get(kind) ?? [];
            return (
              <li key={kind} className={styles.group}>
                <p className={styles.kind}>
                  {KIND_LABEL[kind]}
                  <span className={styles.count}>{list.length}</span>
                </p>
                {/* The hint is the actionable half and the same for
                    every finding of a kind, so it is said once. */}
                {list[0]?.hint !== undefined && (
                  <p className={styles.hint}>{list[0].hint}</p>
                )}
                <ul className={styles.items}>
                  {list.slice(0, MAX_PER_KIND).map((finding, index) => (
                    <li key={`${finding.elementId ?? 'view'}-${index}`}>
                      <button
                        type="button"
                        className={styles.item}
                        disabled={finding.elementId === null}
                        onClick={() => {
                          if (finding.elementId !== null) selectElement(finding.elementId);
                        }}
                        title={finding.message}
                      >
                        <span className={styles.where}>
                          {finding.className ?? 'this view'}
                        </span>
                        <span className={styles.what}>{finding.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {list.length > MAX_PER_KIND && (
                  <p className={styles.more}>
                    and {list.length - MAX_PER_KIND} more
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
};
