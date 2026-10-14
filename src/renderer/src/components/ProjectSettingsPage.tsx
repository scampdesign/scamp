import { useState } from 'react';
import type {
  Breakpoint,
  ComponentFile,
  ProjectConfig,
  RouteFile,
  RouteRender,
} from '@shared/types';
import { DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { Button } from './controls/Button';
import { ColorInput } from './controls/ColorInput';
import { NumberInput } from './controls/NumberInput';
import { PrefixSuffixInput } from './controls/PrefixSuffixInput';
import { FontsSection } from './sections/FontsSection';
import { RouteList } from './projectShell/RoutesSection';
import type { FrameworkUpdate } from './projectShell/useFrameworkUpdate';
import styles from './ProjectSettingsPage.module.css';

/** Fallback shown in the card-color picker when the project has none set.
 *  Matches the Start Screen card's CSS default (`--bg-raised`). */
const DEFAULT_CARD_BACKGROUND = '#1f1f1f';

type Props = {
  projectName: string;
  projectPath: string;
  config: ProjectConfig;
  onChange: (next: ProjectConfig) => void;
  onBack: () => void;
  /**
   * Scamp-framework projects: the keys in `.dev.vars`, the local secrets
   * `load()` and API routes read through `env`. Values stay on disk.
   */
  /** Scamp-framework projects: the installed scampjs, and an update when npm has one. */
  framework?: FrameworkUpdate;
  environment?: { exists: boolean; keys: ReadonlyArray<string>; onOpen: () => void };
  /**
   * Scamp-framework projects: every route in the project, page and
   * API. The sidebar's Routes section is scoped to the open page, so
   * this is where the project as a whole is visible.
   */
  routes?: {
    routes: ReadonlyArray<RouteFile>;
    /** Views with no page route yet. */
    unrouted: ReadonlyArray<ComponentFile>;
    busy: boolean;
    onOpen: (file: string) => void;
    onSetRender: (file: string, render: RouteRender) => void;
    onGenerate: (viewName: string) => void;
  };
};

export const ProjectSettingsPage = ({
  projectName,
  projectPath,
  environment,
  framework,
  routes,
  config,
  onChange,
  onBack,
}: Props): JSX.Element => {
  const handleArtboardChange = (value: string): void => {
    onChange({ ...config, artboardBackground: value });
  };

  const updateBreakpoints = (breakpoints: Breakpoint[]): void => {
    // Keep widest-first ordering so the generator emits in CSS cascade
    // order automatically.
    const sorted = [...breakpoints].sort((a, b) => b.width - a.width);
    onChange({ ...config, breakpoints: sorted });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack} type="button">
          ← Back
        </button>
        <h1 className={styles.headerTitle}>Project Settings</h1>
        <span className={styles.headerProject}>{projectName}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>General</h2>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Artboard background</span>
            <div className={styles.rowControl}>
              <ColorInput
                value={config.artboardBackground}
                onChange={handleArtboardChange}
              />
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Card background</span>
            <div className={styles.rowControl}>
              <ColorInput
                value={config.cardBackground ?? DEFAULT_CARD_BACKGROUND}
                onChange={(value) =>
                  onChange({ ...config, cardBackground: value })
                }
              />
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Status</span>
            <div className={styles.rowControl}>
              <PrefixSuffixInput
                value={config.state ?? ''}
                placeholder="e.g. in progress"
                onCommit={(value) =>
                  onChange({
                    ...config,
                    state: value.trim() ? value.trim() : undefined,
                  })
                }
              />
            </div>
          </div>
        </div>

        {framework !== undefined && (
          <div className={styles.section} data-testid="settings-framework">
            <h2 className={styles.sectionTitle}>Framework</h2>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                <code>scampjs</code>
              </span>
              <div className={styles.rowControl}>
                <span data-testid="framework-version">
                  {framework.installed === null
                    ? 'Not installed yet'
                    : framework.updateTo === null
                      ? `${framework.installed}, up to date`
                      : `${framework.installed}, ${framework.updateTo} available`}
                </span>
                {framework.updateTo !== null && (
                  <Button variant="primary" size="sm" onClick={framework.onUpdate} disabled={framework.updating}>
                    {framework.updating ? 'Updating…' : 'Update'}
                  </Button>
                )}
              </div>
            </div>
            {framework.error !== null && (
              <p className={styles.hint} role="alert">
                The update failed: {framework.error}
              </p>
            )}
            <p className={styles.hint}>
              {framework.installed === null
                ? 'Scamp installs it the first time you open the preview.'
                : 'Updating runs npm install in the project and restarts the preview. Restart any dev server you run yourself.'}
            </p>
          </div>
        )}

        {routes !== undefined && (
          <div className={styles.section} data-testid="settings-routes">
            <h2 className={styles.sectionTitle}>Routes</h2>
            {routes.routes.length === 0 && routes.unrouted.length === 0 ? (
              <p className={styles.hint}>
                No routes yet. Add a page to get a view, then generate its route.
              </p>
            ) : (
              <RouteList
                routes={routes.routes}
                unrouted={routes.unrouted}
                busy={routes.busy}
                onOpen={routes.onOpen}
                onSetRender={routes.onSetRender}
                onGenerate={routes.onGenerate}
              />
            )}
            <p className={styles.hint}>
              Every route in the project, page and API. Opening one shows it in
              the code panel. The properties panel shows the open page's route
              on its own.
            </p>
          </div>
        )}

        {environment !== undefined && (
          <div className={styles.section} data-testid="settings-environment">
            <h2 className={styles.sectionTitle}>Environment</h2>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                <code>.dev.vars</code>
              </span>
              <div className={styles.rowControl}>
                {environment.exists ? (
                  <span>{environment.keys.length === 0 ? 'No keys yet' : environment.keys.join(', ')}</span>
                ) : (
                  <span>Not created yet</span>
                )}
                <Button variant="secondary" size="sm" onClick={environment.onOpen}>
                  Open
                </Button>
              </div>
            </div>
            <p className={styles.hint}>
              Local values for <code>env</code> in <code>load()</code> and API routes, one{' '}
              <code>KEY=value</code> per line. Gitignored, never in snapshots, and never shown
              here.
            </p>
          </div>
        )}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Breakpoints</h2>
          <BreakpointsEditor
            breakpoints={config.breakpoints}
            onChange={updateBreakpoints}
          />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Fonts</h2>
          <FontsSection projectPath={projectPath} />
        </div>
      </div>
    </div>
  );
};

type BreakpointsEditorProps = {
  breakpoints: Breakpoint[];
  onChange: (next: Breakpoint[]) => void;
};

const BreakpointsEditor = ({
  breakpoints,
  onChange,
}: BreakpointsEditorProps): JSX.Element => {
  // Local id for newly-added breakpoints before the user types a real
  // one. Incremented so successive adds don't collide.
  const [nextId, setNextId] = useState(1);

  const updateAt = (idx: number, patch: Partial<Breakpoint>): void => {
    const next = breakpoints.map((bp, i) => (i === idx ? { ...bp, ...patch } : bp));
    onChange(next);
  };

  const removeAt = (idx: number): void => {
    const target = breakpoints[idx];
    if (!target) return;
    // Never remove desktop — it's the base breakpoint every other one
    // cascades from.
    if (target.id === DESKTOP_BREAKPOINT_ID) return;
    onChange(breakpoints.filter((_, i) => i !== idx));
  };

  const addBreakpoint = (): void => {
    const id = `custom-${nextId}`;
    setNextId(nextId + 1);
    onChange([
      ...breakpoints,
      { id, label: 'Custom', width: 600 },
    ]);
  };

  return (
    <div>
      <p className={styles.sectionHint}>
        Style edits made while a non-desktop breakpoint is active land inside
        the matching <code>@media (max-width: Npx)</code> block. Desktop is
        the base — no <code>@media</code> wrapper.
      </p>
      <div className={styles.bpTable}>
        {breakpoints.map((bp, idx) => {
          const isDesktop = bp.id === DESKTOP_BREAKPOINT_ID;
          return (
            <div key={bp.id} className={styles.bpRow}>
              <div className={styles.bpLabelCell}>
                <PrefixSuffixInput
                  value={bp.label}
                  placeholder="Label"
                  onCommit={(next) => updateAt(idx, { label: next })}
                />
              </div>
              <div className={styles.bpWidthCell}>
                <NumberInput
                  value={bp.width}
                  onChange={(next) => {
                    if (next !== undefined) updateAt(idx, { width: Math.round(next) });
                  }}
                  min={100}
                  max={4000}
                  suffix="px"
                />
              </div>
              <button
                type="button"
                className={styles.bpRemove}
                onClick={() => removeAt(idx)}
                disabled={isDesktop}
                aria-label={
                  isDesktop
                    ? `Remove ${bp.label} (disabled)`
                    : `Remove ${bp.label}`
                }
                title={
                  isDesktop
                    ? 'Desktop is the base breakpoint and cannot be removed'
                    : 'Remove breakpoint'
                }
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className={styles.bpAdd} onClick={addBreakpoint}>
        + Add breakpoint
      </button>
    </div>
  );
};
