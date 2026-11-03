import styles from './DiffView.module.css';

type Props = { diff: string };

const kindOf = (line: string): string =>
  line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')
    ? 'meta'
    : line.startsWith('@@')
      ? 'hunk'
      : line.startsWith('+')
        ? 'add'
        : line.startsWith('-')
          ? 'del'
          : 'ctx';

/** A unified diff, one line per row, added and removed lines marked. */
export const DiffView = ({ diff }: Props): JSX.Element => (
  <pre className={styles.diff} data-testid="embedded-diff">
    {diff.split('\n').map((line, i) => (
      <span key={i} className={styles.line} data-kind={kindOf(line)}>
        {line}
        {'\n'}
      </span>
    ))}
  </pre>
);
