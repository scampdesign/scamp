import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PROJECT_CONFIG } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';
/**
 * Owns the per-project `scamp.config.json`: reads it on open (defaults
 * render immediately so the canvas doesn't flash a wrong background while
 * the first read is in flight), exposes a change handler that writes back,
 * and mirrors the breakpoint table into the canvas store so deeply-nested
 * components can read it without prop drilling.
 */
export const useProjectConfig = (projectPath) => {
    const [projectConfig, setProjectConfig] = useState(DEFAULT_PROJECT_CONFIG);
    const latest = useRef(projectConfig);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const next = await window.scamp.readProjectConfig({ projectPath });
            if (cancelled)
                return;
            latest.current = next;
            setProjectConfig(next);
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [projectPath]);
    const handleProjectConfigChange = useCallback((next) => {
        latest.current = next;
        setProjectConfig(next);
        void window.scamp.writeProjectConfig({ projectPath, config: next });
    }, [projectPath]);
    const handlePageLayoutChange = useCallback((update) => {
        const { pageLayout: _previous, ...rest } = latest.current;
        const pageLayout = update(latest.current.pageLayout);
        handleProjectConfigChange(pageLayout === undefined ? rest : { ...rest, pageLayout });
    }, [handleProjectConfigChange]);
    // Mirror the project's breakpoint table into the canvas store so
    // deeply-nested components (ElementRenderer, cascaded styles) can
    // read it without prop drilling.
    useEffect(() => {
        useCanvasStore.getState().setBreakpoints(projectConfig.breakpoints);
    }, [projectConfig.breakpoints]);
    return { projectConfig, handleProjectConfigChange, handlePageLayoutChange };
};
