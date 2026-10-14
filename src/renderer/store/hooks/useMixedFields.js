import { mixedFields } from '@lib/multiEdit';
import { resolveElementAtState } from '@lib/stateCascade';
import { useCanvasStore } from '../canvasSlice';
/**
 * Which of a section's fields the selected elements it fits disagree on,
 * at the active breakpoint and state. Nothing is mixed for one element.
 * see docs/archive/2026-10-14-multi-select-edit-plan.md
 */
export const useMixedFields = (fits) => {
    // Joined so the selector returns a primitive and only re-renders on a change.
    const joined = useCanvasStore((s) => {
        if (s.selectedElementIds.length < 2)
            return '';
        const resolved = s.selectedElementIds.flatMap((id) => {
            const el = s.elements[id];
            return el !== undefined && fits(el)
                ? [resolveElementAtState(el, s.activeBreakpointId, s.breakpoints, s.activeStateName)]
                : [];
        });
        return mixedFields(resolved).join('\n');
    });
    const keys = new Set(joined.length === 0 ? [] : joined.split('\n'));
    return {
        isMixed: (key) => keys.has(key),
        isMixedCustom: (property) => keys.has(`custom:${property}`),
    };
};
