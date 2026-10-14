import { Button } from './controls/Button';
import type { FrameworkInfo } from '@shared/types';
import { SUPPORTED_CONTRACT, isSupportedContract } from '@shared/projectConfig';
import styles from './ParseErrorBanner.module.css';

type Props = {
  framework: FrameworkInfo;
  onDismiss: () => void;
};

/**
 * Shown above the canvas of a scamp-format project whose installed
 * `scampjs` implements a contract this build can't read or write: a
 * save would write a shape the framework doesn't understand, so the
 * user needs to know before editing.
 *
 * A MISSING `scampjs` is not a banner. Designing doesn't need it —
 * the app reads and writes the files itself — and the first preview
 * installs the project's dependencies anyway.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
export const FrameworkContractBanner = ({ framework, onDismiss }: Props): JSX.Element | null => {
  if (framework.installedVersion === null) return null;
  if (isSupportedContract(framework.contract)) return null;
  const min: number = SUPPORTED_CONTRACT.min;
  const max: number = SUPPORTED_CONTRACT.max;
  const range = min === max ? `${max}` : `${min}–${max}`;
  const title = `This project's scampjs uses contract ${framework.contract ?? '?'}`;
  const message = `This version of Scamp supports contract ${range}. Update Scamp, or install a scampjs release that implements contract ${range}, before editing — a save would write the older shape.`;
  return (
    <div className={styles.banner} role="status" data-testid="framework-contract-banner">
      <div className={styles.content}>
        <span className={styles.icon} aria-hidden="true">
          ℹ
        </span>
        <div className={styles.text}>
          <strong className={styles.title}>{title}</strong>
          <span className={styles.message}>{message}</span>
        </div>
      </div>
      <div className={styles.dismissWrap}>
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
};
