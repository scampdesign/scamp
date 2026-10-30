import { useCallback, useEffect, useState } from "react"
import { IconFolder, IconLayoutGrid, IconList } from "@tabler/icons-react"
import type { ProjectData, Settings, StartScreenProject } from "@shared/types"
import { errorMessage } from "@shared/errorMessage"
import { formatLastOpened } from "@lib/formatLastOpened"
import { projectDisplayName } from "@lib/projectDisplayName"
import { basename } from "../lib/path"
import { startTutorial } from "../lib/startTutorial"
import { useOnboardingStore } from "@store/onboardingSlice"
import { CreateProjectModal } from "./CreateProjectModal"
import { AccountPanel } from "./startScreen/AccountPanel"
import { ProjectCardThumb } from "./startScreen/ProjectCardThumb"
import { SegmentedControl } from "./controls/SegmentedControl"
import { Tooltip } from "./controls/Tooltip"
import styles from "./StartScreen.module.css"

// Vite resolves this to the bundled, hashed asset URL at build time.
const scampLogoUrl = new URL("../assets/scamp-icon.png", import.meta.url).href

type ViewMode = "card" | "list"
const VIEW_STORAGE_KEY = "scamp.projectsView"
const readStoredView = (): ViewMode =>
  globalThis.localStorage?.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "card"

type Props = {
  onProjectOpened: (project: ProjectData) => void
  onOpenSettings: () => void
}

export const StartScreen = ({
  onProjectOpened,
  onOpenSettings,
}: Props): JSX.Element => {
  const [projects, setProjects] = useState<StartScreenProject[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  // Set when the first-run folder pick lands, if the tutorial was never offered.
  const [offerTutorial, setOfferTutorial] = useState(false)
  // Card is the default view; the choice is remembered across launches.
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView)
  const changeView = (next: ViewMode): void => {
    setViewMode(next)
    globalThis.localStorage?.setItem(VIEW_STORAGE_KEY, next)
  }

  const refreshProjects = useCallback(async (): Promise<void> => {
    const list = await window.scamp.getStartScreenProjects()
    setProjects(list)
  }, [])

  const refreshSettings = useCallback(async (): Promise<void> => {
    const next = await window.scamp.getSettings()
    setSettings(next)
  }, [])

  useEffect(() => {
    void refreshProjects()
    void refreshSettings()
  }, [refreshProjects, refreshSettings])

  const defaultFolder = settings?.defaultProjectsFolder ?? null

  const handlePickDefaultFolder = async (): Promise<void> => {
    setError(null)
    const firstRun = defaultFolder === null
    try {
      const result = await window.scamp.chooseFolder()
      if (result.canceled || !result.path) return
      const next = await window.scamp.setDefaultProjectsFolder(result.path)
      if (next && typeof next === "object" && "defaultProjectsFolder" in next) {
        setSettings(next)
      } else {
        await refreshSettings()
      }
      // The folder changed — re-scan so its projects show.
      await refreshProjects()
      if (firstRun && !useOnboardingStore.getState().offered) setOfferTutorial(true)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleTakeTutorial = async (): Promise<void> => {
    if (!defaultFolder) return
    setError(null)
    try {
      useOnboardingStore.getState().answerOffer(true)
      onProjectOpened(await startTutorial(defaultFolder))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleSkipTutorial = (): void => {
    useOnboardingStore.getState().answerOffer(false)
    setOfferTutorial(false)
  }

  const handleCreateProject = async (name: string): Promise<void> => {
    if (!defaultFolder) return
    const project = await window.scamp.createProject({
      parentPath: defaultFolder,
      name,
    })
    onProjectOpened(project)
  }

  const handleOpenProject = async (): Promise<void> => {
    setError(null)
    const result = await window.scamp.chooseFolder()
    if (result.canceled || !result.path) return
    try {
      const project = await window.scamp.openProject({
        folderPath: result.path,
      })
      onProjectOpened(project)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleOpenProjectItem = async (
    item: StartScreenProject,
  ): Promise<void> => {
    if (!item.exists) return
    setError(null)
    try {
      const project = await window.scamp.openProject({
        folderPath: item.path,
      })
      onProjectOpened(project)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleRemoveRecent = async (path: string): Promise<void> => {
    await window.scamp.removeRecentProject(path)
    await refreshProjects()
  }

  // ---- Render ----

  const renderMain = (): JSX.Element => {
    // First-run: no default folder yet.
    if (settings && !defaultFolder) {
      return (
        <div className={styles.welcomeState}>
          <h2 className={styles.welcomeHeading}>Welcome to Scamp</h2>
          <p className={styles.welcomeText}>
            Pick a default folder where new projects will live. Each project
            gets its own subfolder inside it. You can change this later.
          </p>
          <button
            className={styles.welcomeButton}
            onClick={handlePickDefaultFolder}
            type="button"
          >
            Choose Folder
          </button>
        </div>
      )
    }

    if (offerTutorial) {
      return (
        <div className={styles.welcomeState} data-testid="tutorial-offer">
          <h2 className={styles.welcomeHeading}>Learn the basics</h2>
          <p className={styles.welcomeText}>
            The tutorial creates a project called scamp-tutorial and walks
            you through five short lessons: drawing, layout, editing the
            code, components, and tokens. You can start it later from
            Settings.
          </p>
          <div className={styles.welcomeActions}>
            <button
              className={styles.welcomeButton}
              onClick={() => void handleTakeTutorial()}
              type="button"
            >
              Take the tutorial
            </button>
            <button
              className={styles.welcomeSecondary}
              onClick={handleSkipTutorial}
              type="button"
            >
              Skip
            </button>
          </div>
        </div>
      )
    }

    const now = Date.now()

    const lastOpenedLabel = (project: StartScreenProject): string =>
      project.lastOpened
        ? formatLastOpened(new Date(project.lastOpened).getTime(), now)
        : "Never opened"

    // Show only the parent folder + project name, e.g. ".../scamp-files/home".
    const shortPath = (fullPath: string): string => {
      const parts = fullPath.split(/[\\/]+/).filter(Boolean)
      if (parts.length <= 2) return fullPath
      return `.../${parts.slice(-2).join("/")}`
    }

    const renderCards = (): JSX.Element => (
      <div className={styles.cardGrid}>
        {projects.map((project) => {
          return (
            <div
              key={project.path}
              className={`${styles.card} ${project.exists ? "" : styles.cardMissing}`}
            >
              <button
                className={styles.cardOpen}
                onClick={() => handleOpenProjectItem(project)}
                disabled={!project.exists}
                type="button"
              >
                {project.exists && (
                  <ProjectCardThumb
                    projectPath={project.path}
                    hasThumbnail={project.hasThumbnail === true}
                    background={project.cardBackground}
                  />
                )}
                <span className={styles.cardBody}>
                  {/* Title + status and the "updated" line are one group so
                      `space-between` on the body pins the path to the bottom
                      edge — cards then line up even when a title wraps. */}
                  <span className={styles.cardTopGroup}>
                    <span className={styles.cardTop}>
                      <span className={styles.cardName} title={project.name}>
                        {projectDisplayName(project.name)}
                      </span>
                      {project.state && (
                        <span className={styles.cardState}>{project.state}</span>
                      )}
                    </span>
                    <span className={styles.cardMeta}>
                      {lastOpenedLabel(project)}
                    </span>
                  </span>
                  {project.exists ? (
                    <span className={styles.cardPath} title={project.path}>
                      {shortPath(project.path)}
                    </span>
                  ) : (
                    <span className={styles.cardMissingLabel}>
                      Folder not found
                    </span>
                  )}
                </span>
              </button>
              {!project.exists && (
                <Tooltip label="Remove from list">
                  <button
                    className={styles.cardRemove}
                    onClick={() => handleRemoveRecent(project.path)}
                    type="button"
                  >
                    ×
                  </button>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>
    )

    const renderList = (): JSX.Element => (
      <ul className={styles.recentList}>
        {projects.map((project) => (
          <li
            key={project.path}
            className={`${styles.recentItem} ${project.exists ? "" : styles.recentMissing}`}
          >
            <button
              className={styles.recentButton}
              onClick={() => handleOpenProjectItem(project)}
              disabled={!project.exists}
              type="button"
            >
              <span className={styles.recentName} title={project.name}>
                {projectDisplayName(project.name)}
                {project.state && (
                  <span className={styles.recentState}>{project.state}</span>
                )}
              </span>
              <span className={styles.recentPath}>{project.path}</span>
              {!project.exists && (
                <span className={styles.recentLabel}>Folder not found</span>
              )}
            </button>
            {/* The remove (x) only clears stale entries from the recents
                store. Projects that exist on disk reappear on the next
                scan, so offering "remove" for them would be misleading. */}
            {!project.exists && (
              <Tooltip label="Remove from list">
                <button
                  className={styles.recentRemove}
                  onClick={() => handleRemoveRecent(project.path)}
                  type="button"
                >
                  x
                </button>
              </Tooltip>
            )}
          </li>
        ))}
      </ul>
    )

    return (
      <>
        <div className={styles.mainHeader}>
          <div className={styles.titleGroup}>
            <h2 className={styles.recentTitle}>Projects</h2>
            {defaultFolder && (
              <Tooltip
                header="Projects folder"
                label={`${defaultFolder}\nClick to choose a different one.`}
              >
                <button
                  className={styles.folderButton}
                  onClick={handlePickDefaultFolder}
                  type="button"
                  aria-label={`Projects folder: ${defaultFolder}. Choose a different one.`}
                >
                  <IconFolder size={16} stroke={1.75} />
                </button>
              </Tooltip>
            )}
          </div>
          {projects.length > 0 && (
            <div className={styles.viewToggle}>
              <SegmentedControl<ViewMode>
                value={viewMode}
                options={[
                  {
                    value: "card",
                    label: <IconLayoutGrid size={16} stroke={1.75} />,
                    ariaLabel: "Card view",
                    tooltip: "Card view",
                  },
                  {
                    value: "list",
                    label: <IconList size={16} stroke={1.75} />,
                    ariaLabel: "List view",
                    tooltip: "List view",
                  },
                ]}
                onChange={changeView}
              />
            </div>
          )}
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {projects.length === 0 ? (
          <div className={styles.emptyState}>
            No projects yet — create one or open a folder.
          </div>
        ) : viewMode === "card" ? (
          renderCards()
        ) : (
          renderList()
        )}
      </>
    )
  }

  return (
    <div className={styles.screen}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img className={styles.brandLogo} src={scampLogoUrl} alt="" />
          <h1 className={styles.sidebarTitle}>Scamp</h1>
        </div>
        <p className={styles.sidebarSubtitle}>
          Local design tool — draw, get real code.
        </p>

        <div className={styles.sidebarActions}>
          <button
            className={styles.primary}
            onClick={() => setShowCreateModal(true)}
            type="button"
            disabled={!defaultFolder}
          >
            New Project
          </button>
          <button
            className={styles.secondary}
            onClick={handleOpenProject}
            type="button"
          >
            Open Project
          </button>
        </div>

        <div className={styles.sidebarSpacer} />

        <div className={styles.resources}>
          <span className={styles.footerLabel}>Resources</span>
          <button
            className={styles.linkButton}
            onClick={() =>
              window.open(
                "https://discord.com/invite/xyx5WwVbEG",
                "_blank",
                "noopener,noreferrer",
              )
            }
            type="button"
          >
            Discord community
          </button>
          <button
            className={styles.linkButton}
            onClick={() =>
              window.open(
                "https://scampdesign.app/docs",
                "_blank",
                "noopener,noreferrer",
              )
            }
            type="button"
          >
            Documentation
          </button>
          <button
            className={styles.linkButton}
            onClick={() =>
              window.open(
                "https://scampdesign.app/changelog",
                "_blank",
                "noopener,noreferrer",
              )
            }
            type="button"
          >
            Changelog
          </button>
        </div>

        <button
          className={`${styles.secondary} ${styles.settingsButton}`}
          onClick={onOpenSettings}
          type="button"
        >
          Settings
        </button>

        <AccountPanel />
      </aside>

      <main className={styles.main}>{renderMain()}</main>

      {showCreateModal && defaultFolder && (
        <CreateProjectModal
          defaultFolder={defaultFolder}
          onSubmit={handleCreateProject}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

export const projectNameFromPath = (p: string): string => basename(p)
