import type { ProjectData } from '@shared/types';
type Props = {
    onBack: () => void;
    /** Open a project made here: the tutorial's. */
    onProjectOpened: (project: ProjectData) => void;
};
export declare const SettingsPage: ({ onBack, onProjectOpened }: Props) => JSX.Element;
export {};
