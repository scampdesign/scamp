import { useEffect, useState } from 'react';

import type { EmbeddedContentField, EmbeddedContentOrigin } from '@shared/types';

import { useEmbeddedStore } from './embeddedStore';
import { commitContent, contentFields, notEditableReason } from './session';
import styles from './ContentSection.module.css';

const LABEL: Record<EmbeddedContentField, string> = { text: 'Text', src: 'Image', alt: 'Alt text', href: 'Link' };

/** Where the content comes from, in a few words; null while Scamp looks. */
const originNote = (origin: EmbeddedContentOrigin | undefined): string => {
  if (origin === undefined) return 'Checking where this comes from…';
  if (origin.kind === 'literal') return `Written at ${origin.at}`;
  if (origin.kind === 'import') return `Imported from ${origin.value}, at ${origin.at}`;
  if (origin.kind === 'prop') return `Set where ${origin.component} is used, at ${origin.at}`;
  return notEditableReason(origin) ?? '';
};

type FieldProps = { field: EmbeddedContentField; value: string; origin: EmbeddedContentOrigin | undefined; uid: string };

const Field = ({ field, value, origin, uid }: FieldProps): JSX.Element => {
  const [draft, setDraft] = useState(value);
  // A new selection, or the page's value changing (an undo), resets the field.
  useEffect(() => setDraft(value), [value, uid]);
  const locked = origin === undefined || notEditableReason(origin) !== null;
  const commit = (): void => {
    if (draft !== value) void commitContent(field, draft);
  };
  return (
    <div className={styles.field} data-field={field}>
      <label className={styles.label}>
        <span>{LABEL[field]}</span>
        <input
          className={styles.input}
          value={draft}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') setDraft(value);
          }}
          placeholder={field === 'alt' ? 'Describe the image' : undefined}
          data-testid={`embedded-content-${field}`}
        />
      </label>
      <p className={styles.note} data-locked={origin !== undefined && locked} data-testid={`embedded-content-${field}-note`}>
        {originNote(origin)}
      </p>
    </div>
  );
};

/**
 * The selection's text, image, and link, in the Style tab. Only content
 * written in the code is editable; content from data says why it isn't.
 * see docs/plans/embedded-canvas-gaps.md (P5)
 */
export const ContentSection = (): JSX.Element | null => {
  const selection = useEmbeddedStore((s) => s.selection);
  if (selection === null) return null;
  const fields = contentFields(selection);
  if (fields.length === 0) return null;
  return (
    <section className={styles.section} data-testid="embedded-content">
      <h3 className={styles.title}>Content</h3>
      {fields.map((field) => (
        <Field key={field} field={field} value={selection.content[field] ?? ''} origin={selection.origins[field]} uid={selection.uid} />
      ))}
      {fields.includes('text') && notEditableReason(selection.origins.text) === null && (
        <p className={styles.hint}>You can also double-click the text on the page to edit it there.</p>
      )}
    </section>
  );
};
