import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import type { ComponentFile, ComponentKind } from '@shared/types';
import type { ActiveComponent, ComponentEdit } from './types';
type Props = {
    /** Components and views together; only components are listed here. */
    components: ComponentFile[];
    projectPath: string;
    componentEdit: ComponentEdit;
    componentEditError: string | null;
    renamingComponent: boolean;
    creatingComponent: boolean;
    activeComponent: ActiveComponent | null;
    setComponentEdit: Dispatch<SetStateAction<ComponentEdit>>;
    setComponentEditError: Dispatch<SetStateAction<string | null>>;
    handleAddComponent: (name: string, kind: ComponentKind) => Promise<void>;
    handleRenameComponent: (oldName: string, newName: string) => Promise<boolean>;
    openComponent: (name: string, fromPage: string | null) => void;
    openComponentMenu: (e: ReactMouseEvent, componentName: string) => void;
};
/** The Components section of the left sidebar: list + inline add/rename. */
export declare const ComponentSidebar: ({ components: allComponents, projectPath, componentEdit, componentEditError, renamingComponent, creatingComponent, activeComponent, setComponentEdit, setComponentEditError, handleAddComponent, handleRenameComponent, openComponent, openComponentMenu, }: Props) => JSX.Element;
export {};
