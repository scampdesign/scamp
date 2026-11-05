import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { IconFolder, IconLayoutGrid, IconList } from "@tabler/icons-react";
import { errorMessage } from "@shared/errorMessage";
import { formatLastOpened } from "@lib/formatLastOpened";
import { projectDisplayName } from "@lib/projectDisplayName";
import { basename } from "../lib/path";
import { startTutorial } from "../lib/startTutorial";
import { useAuthStore } from "@store/authSlice";
import { useOnboardingStore } from "@store/onboardingSlice";
import { CreateProjectModal } from "./CreateProjectModal";
import { AccountPanel } from "./startScreen/AccountPanel";
import { ProjectCardThumb } from "./startScreen/ProjectCardThumb";
import { SegmentedControl } from "./controls/SegmentedControl";
import { Tooltip } from "./controls/Tooltip";
import styles from "./StartScreen.module.css";
// Vite resolves this to the bundled, hashed asset URL at build time.
const scampLogoUrl = new URL("../assets/scamp-icon.png", import.meta.url).href;
const VIEW_STORAGE_KEY = "scamp.projectsView";
const readStoredView = () => globalThis.localStorage?.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "card";
export const StartScreen = ({ onProjectOpened, onOpenSettings, }) => {
    // Behind a flag the website sets per account; main refuses the window without it too.
    const embeddedEnabled = useAuthStore((s) => s.features.embedded);
    const [projects, setProjects] = useState([]);
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    // Set when the first-run folder pick lands, if the tutorial was never offered.
    const [offerTutorial, setOfferTutorial] = useState(false);
    // Card is the default view; the choice is remembered across launches.
    const [viewMode, setViewMode] = useState(readStoredView);
    const changeView = (next) => {
        setViewMode(next);
        globalThis.localStorage?.setItem(VIEW_STORAGE_KEY, next);
    };
    const refreshProjects = useCallback(async () => {
        const list = await window.scamp.getStartScreenProjects();
        setProjects(list);
    }, []);
    const refreshSettings = useCallback(async () => {
        const next = await window.scamp.getSettings();
        setSettings(next);
    }, []);
    useEffect(() => {
        void refreshProjects();
        void refreshSettings();
    }, [refreshProjects, refreshSettings]);
    const defaultFolder = settings?.defaultProjectsFolder ?? null;
    const handlePickDefaultFolder = async () => {
        setError(null);
        const firstRun = defaultFolder === null;
        try {
            const result = await window.scamp.chooseFolder();
            if (result.canceled || !result.path)
                return;
            const next = await window.scamp.setDefaultProjectsFolder(result.path);
            if (next && typeof next === "object" && "defaultProjectsFolder" in next) {
                setSettings(next);
            }
            else {
                await refreshSettings();
            }
            // The folder changed — re-scan so its projects show.
            await refreshProjects();
            if (firstRun && !useOnboardingStore.getState().offered)
                setOfferTutorial(true);
        }
        catch (e) {
            setError(errorMessage(e));
        }
    };
    const handleTakeTutorial = async () => {
        if (!defaultFolder)
            return;
        setError(null);
        try {
            useOnboardingStore.getState().answerOffer(true);
            onProjectOpened(await startTutorial(defaultFolder));
        }
        catch (e) {
            setError(errorMessage(e));
        }
    };
    const handleSkipTutorial = () => {
        useOnboardingStore.getState().answerOffer(false);
        setOfferTutorial(false);
    };
    const handleCreateProject = async (name) => {
        if (!defaultFolder)
            return;
        const project = await window.scamp.createProject({
            parentPath: defaultFolder,
            name,
        });
        onProjectOpened(project);
    };
    // Embedded Scamp opens its own window, which asks for the folder.
    // see docs/plans/embedded-scamp-plan.md
    const handleEditReactProject = () => {
        void window.scamp.openEmbedded();
    };
    const handleOpenProject = async () => {
        setError(null);
        const result = await window.scamp.chooseFolder();
        if (result.canceled || !result.path)
            return;
        try {
            const project = await window.scamp.openProject({
                folderPath: result.path,
            });
            onProjectOpened(project);
        }
        catch (e) {
            setError(errorMessage(e));
        }
    };
    const handleOpenProjectItem = async (item) => {
        if (!item.exists)
            return;
        setError(null);
        try {
            const project = await window.scamp.openProject({
                folderPath: item.path,
            });
            onProjectOpened(project);
        }
        catch (e) {
            setError(errorMessage(e));
        }
    };
    const handleRemoveRecent = async (path) => {
        await window.scamp.removeRecentProject(path);
        await refreshProjects();
    };
    // ---- Render ----
    const renderMain = () => {
        // First-run: no default folder yet.
        if (settings && !defaultFolder) {
            return (_jsxs("div", { className: styles.welcomeState, children: [_jsx("h2", { className: styles.welcomeHeading, children: "Welcome to Scamp" }), _jsx("p", { className: styles.welcomeText, children: "Pick a default folder where new projects will live. Each project gets its own subfolder inside it. You can change this later." }), _jsx("button", { className: styles.welcomeButton, onClick: handlePickDefaultFolder, type: "button", children: "Choose Folder" })] }));
        }
        if (offerTutorial) {
            return (_jsxs("div", { className: styles.welcomeState, "data-testid": "tutorial-offer", children: [_jsx("h2", { className: styles.welcomeHeading, children: "Learn the basics" }), _jsx("p", { className: styles.welcomeText, children: "The tutorial creates a project called scamp-tutorial and walks you through five short lessons: drawing, layout, editing the code, components, and tokens. You can start it later from Settings." }), _jsxs("div", { className: styles.welcomeActions, children: [_jsx("button", { className: styles.welcomeButton, onClick: () => void handleTakeTutorial(), type: "button", children: "Take the tutorial" }), _jsx("button", { className: styles.welcomeSecondary, onClick: handleSkipTutorial, type: "button", children: "Skip" })] })] }));
        }
        const now = Date.now();
        const lastOpenedLabel = (project) => project.lastOpened
            ? formatLastOpened(new Date(project.lastOpened).getTime(), now)
            : "Never opened";
        // Show only the parent folder + project name, e.g. ".../scamp-files/home".
        const shortPath = (fullPath) => {
            const parts = fullPath.split(/[\\/]+/).filter(Boolean);
            if (parts.length <= 2)
                return fullPath;
            return `.../${parts.slice(-2).join("/")}`;
        };
        const renderCards = () => (_jsx("div", { className: styles.cardGrid, children: projects.map((project) => {
                return (_jsxs("div", { className: `${styles.card} ${project.exists ? "" : styles.cardMissing}`, children: [_jsxs("button", { className: styles.cardOpen, onClick: () => handleOpenProjectItem(project), disabled: !project.exists, type: "button", children: [project.exists && (_jsx(ProjectCardThumb, { projectPath: project.path, hasThumbnail: project.hasThumbnail === true, background: project.cardBackground })), _jsxs("span", { className: styles.cardBody, children: [_jsxs("span", { className: styles.cardTopGroup, children: [_jsxs("span", { className: styles.cardTop, children: [_jsx("span", { className: styles.cardName, title: project.name, children: projectDisplayName(project.name) }), project.state && (_jsx("span", { className: styles.cardState, children: project.state }))] }), _jsx("span", { className: styles.cardMeta, children: lastOpenedLabel(project) })] }), project.exists ? (_jsx("span", { className: styles.cardPath, title: project.path, children: shortPath(project.path) })) : (_jsx("span", { className: styles.cardMissingLabel, children: "Folder not found" }))] })] }), !project.exists && (_jsx(Tooltip, { label: "Remove from list", children: _jsx("button", { className: styles.cardRemove, onClick: () => handleRemoveRecent(project.path), type: "button", children: "\u00D7" }) }))] }, project.path));
            }) }));
        const renderList = () => (_jsx("ul", { className: styles.recentList, children: projects.map((project) => (_jsxs("li", { className: `${styles.recentItem} ${project.exists ? "" : styles.recentMissing}`, children: [_jsxs("button", { className: styles.recentButton, onClick: () => handleOpenProjectItem(project), disabled: !project.exists, type: "button", children: [_jsxs("span", { className: styles.recentName, title: project.name, children: [projectDisplayName(project.name), project.state && (_jsx("span", { className: styles.recentState, children: project.state }))] }), _jsx("span", { className: styles.recentPath, children: project.path }), !project.exists && (_jsx("span", { className: styles.recentLabel, children: "Folder not found" }))] }), !project.exists && (_jsx(Tooltip, { label: "Remove from list", children: _jsx("button", { className: styles.recentRemove, onClick: () => handleRemoveRecent(project.path), type: "button", children: "x" }) }))] }, project.path))) }));
        return (_jsxs(_Fragment, { children: [_jsxs("div", { className: styles.mainHeader, children: [_jsxs("div", { className: styles.titleGroup, children: [_jsx("h2", { className: styles.recentTitle, children: "Projects" }), defaultFolder && (_jsx(Tooltip, { header: "Projects folder", label: `${defaultFolder}\nClick to choose a different one.`, children: _jsx("button", { className: styles.folderButton, onClick: handlePickDefaultFolder, type: "button", "aria-label": `Projects folder: ${defaultFolder}. Choose a different one.`, children: _jsx(IconFolder, { size: 16, stroke: 1.75 }) }) }))] }), projects.length > 0 && (_jsx("div", { className: styles.viewToggle, children: _jsx(SegmentedControl, { value: viewMode, options: [
                                    {
                                        value: "card",
                                        label: _jsx(IconLayoutGrid, { size: 16, stroke: 1.75 }),
                                        ariaLabel: "Card view",
                                        tooltip: "Card view",
                                    },
                                    {
                                        value: "list",
                                        label: _jsx(IconList, { size: 16, stroke: 1.75 }),
                                        ariaLabel: "List view",
                                        tooltip: "List view",
                                    },
                                ], onChange: changeView }) }))] }), error && _jsx("div", { className: styles.error, children: error }), projects.length === 0 ? (_jsx("div", { className: styles.emptyState, children: "No projects yet \u2014 create one or open a folder." })) : viewMode === "card" ? (renderCards()) : (renderList())] }));
    };
    return (_jsxs("div", { className: styles.screen, children: [_jsxs("aside", { className: styles.sidebar, children: [_jsxs("div", { className: styles.brand, children: [_jsx("img", { className: styles.brandLogo, src: scampLogoUrl, alt: "" }), _jsx("h1", { className: styles.sidebarTitle, children: "Scamp" })] }), _jsx("p", { className: styles.sidebarSubtitle, children: "Local design tool \u2014 draw, get real code." }), _jsxs("div", { className: styles.sidebarActions, children: [_jsx("button", { className: styles.primary, onClick: () => setShowCreateModal(true), type: "button", disabled: !defaultFolder, children: "New Project" }), _jsx("button", { className: styles.secondary, onClick: handleOpenProject, type: "button", children: "Open Project" }), embeddedEnabled && (_jsx("button", { className: styles.secondary, onClick: handleEditReactProject, type: "button", title: "Restyle an existing Vite + React or Next.js project in place", "data-testid": "start-edit-react-project", children: "Edit React Project" }))] }), _jsx("div", { className: styles.sidebarSpacer }), _jsxs("div", { className: styles.resources, children: [_jsx("span", { className: styles.footerLabel, children: "Resources" }), _jsx("button", { className: styles.linkButton, onClick: () => window.open("https://discord.com/invite/xyx5WwVbEG", "_blank", "noopener,noreferrer"), type: "button", children: "Discord community" }), _jsx("button", { className: styles.linkButton, onClick: () => window.open("https://scampdesign.app/docs", "_blank", "noopener,noreferrer"), type: "button", children: "Documentation" }), _jsx("button", { className: styles.linkButton, onClick: () => window.open("https://scampdesign.app/changelog", "_blank", "noopener,noreferrer"), type: "button", children: "Changelog" })] }), _jsx("button", { className: `${styles.secondary} ${styles.settingsButton}`, onClick: onOpenSettings, type: "button", children: "Settings" }), _jsx(AccountPanel, {})] }), _jsx("main", { className: styles.main, children: renderMain() }), showCreateModal && defaultFolder && (_jsx(CreateProjectModal, { defaultFolder: defaultFolder, onSubmit: handleCreateProject, onCancel: () => setShowCreateModal(false) }))] }));
};
export const projectNameFromPath = (p) => basename(p);
