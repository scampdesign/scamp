import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { generateDesignMd, parseDesignMd, } from '@lib/designMd';
/** Prose with a name fallback. */
const withDefaultName = (prose, defaultName) => prose.name === undefined || prose.name.trim() === ''
    ? { ...prose, name: defaultName }
    : prose;
/**
 * Two-way sync between the Design System prose forms (the store's
 * `designProse`) and DESIGN.md:
 *
 *  - on open, load the file's authored prose into the store;
 *  - on any token / prose change, regenerate DESIGN.md (debounced 500ms),
 *    writing only when the content actually changed;
 *  - when DESIGN.md changes on disk, read the prose back — but ignore the
 *    echoes of our OWN writes (tracked via `lastWritten`) so a self-write
 *    can't be mistaken for an external edit and clobber in-flight edits.
 *
 * The token YAML is always derived from theme.css; only the prose round-trips.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export const useDesignMdSync = (projectPath, projectName) => {
    const themeBaseTokens = useCanvasStore((s) => s.themeBaseTokens);
    const designProse = useCanvasStore((s) => s.designProse);
    const setDesignProse = useCanvasStore((s) => s.setDesignProse);
    const timer = useRef(null);
    // The last DESIGN.md content Scamp itself put on disk — used to tell our
    // own watcher echoes apart from genuine external edits.
    const lastWritten = useRef('');
    // Gate writes until the file's prose has loaded, so we never regenerate
    // DESIGN.md from the empty default and clobber authored prose.
    const [proseLoaded, setProseLoaded] = useState(false);
    useEffect(() => {
        if (projectPath === '')
            return;
        setProseLoaded(false);
        let cancelled = false;
        void (async () => {
            const content = await window.scamp.readDesignMd({ projectPath });
            if (cancelled)
                return;
            lastWritten.current = content;
            setDesignProse(withDefaultName(parseDesignMd(content), projectName));
            setProseLoaded(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath, projectName, setDesignProse]);
    // Read prose back on genuine external DESIGN.md edits (ignore our echoes).
    useEffect(() => {
        const off = window.scamp.onDesignMdChanged((content) => {
            if (content === lastWritten.current)
                return;
            lastWritten.current = content;
            setDesignProse(withDefaultName(parseDesignMd(content), projectName));
        });
        return off;
    }, [projectName, setDesignProse]);
    // Regenerate DESIGN.md when tokens or prose change (debounced).
    useEffect(() => {
        if (projectPath === '' || !proseLoaded || themeBaseTokens.length === 0)
            return;
        if (timer.current)
            clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            void (async () => {
                const content = generateDesignMd(themeBaseTokens, designProse);
                if (content !== lastWritten.current) {
                    lastWritten.current = content;
                    await window.scamp.writeDesignMd({ projectPath, content });
                }
            })();
        }, 500);
        return () => {
            if (timer.current)
                clearTimeout(timer.current);
        };
    }, [projectPath, proseLoaded, themeBaseTokens, designProse]);
};
