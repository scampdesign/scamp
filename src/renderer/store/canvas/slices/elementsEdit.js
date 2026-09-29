// store/canvas/slices/elementsEdit.ts — domain slice split from canvasSlice.ts (5.1).
import { applyStyleToRange, isStyled, runsOf, textFromRuns, } from '@lib/textRuns';
import { canonicalizeGroupList } from '@lib/propertyGroups';
import { PRESETS_BY_NAME, isPresetName } from '@lib/animationPresets';
import { classNameFor } from '@lib/generateCode';
import { resolveElementAtState } from '@lib/stateCascade';
import { applyPatchWithAxisRouting, } from '../patchRouting';
import { commitElementsToHistory } from '../history';
import { useCanvasStore, } from '../../canvasSlice';
export const createElementsEditSlice = (set) => ({
    previewAnimation: null,
    setPropOverride: (instanceId, propName, value) => {
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        let didChange = false;
        set((state) => {
            const el = state.elements[instanceId];
            if (!el || el.type !== 'component-instance')
                return state;
            const current = el.propOverrides ?? {};
            if (current[propName] === value)
                return state;
            const nextOverrides = { ...current, [propName]: value };
            didChange = true;
            return {
                elements: {
                    ...state.elements,
                    [instanceId]: { ...el, propOverrides: nextOverrides },
                },
            };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [instanceId],
                propertyKeys: ['propOverrides'],
            });
        }
    },
    clearPropOverride: (instanceId, propName) => {
        let didChange = false;
        set((state) => {
            const el = state.elements[instanceId];
            if (!el || el.type !== 'component-instance')
                return state;
            const current = el.propOverrides ?? {};
            if (!(propName in current))
                return state;
            const { [propName]: _drop, ...rest } = current;
            didChange = true;
            return {
                elements: {
                    ...state.elements,
                    [instanceId]: { ...el, propOverrides: rest },
                },
            };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [instanceId],
                propertyKeys: ['propOverrides'],
            });
        }
    },
    setElementText: (id, text) => {
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            // Retyping the words invalidates the runs: the offsets they were
            // split at describe text that no longer exists. Dropping them is
            // a VISIBLE loss of styling, which is the honest outcome of
            // replacing the sentence — silently keeping stale boundaries
            // would style the wrong words.
            // see docs/plans/inline-spans-plan.md
            const { runs: _dropped, ...rest } = el;
            return {
                elements: { ...state.elements, [id]: { ...rest, text } },
            };
        });
        commitElementsToHistory({
            kind: 'patch',
            elementIds: [id],
            propertyKeys: ['text'],
        });
    },
    styleTextRange: (id, start, end, style) => {
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        let changed = false;
        set((state) => {
            const el = state.elements[id];
            if (!el || el.type !== 'text')
                return state;
            const next = applyStyleToRange(runsOf(el), start, end, style);
            // One unstyled run is what a plain text element already is, and
            // storing it would put a `runs` field on every element anyone has
            // ever styled and then un-styled.
            const plain = next.length === 1 && !isStyled(next[0]);
            const { runs: _drop, ...rest } = el;
            changed = true;
            return {
                elements: {
                    ...state.elements,
                    [id]: plain
                        ? { ...rest, text: textFromRuns(next) }
                        : { ...rest, runs: next, text: textFromRuns(next) },
                },
            };
        });
        if (!changed)
            return;
        commitElementsToHistory({
            kind: 'patch',
            elementIds: [id],
            propertyKeys: ['runs', 'text'],
        });
    },
    togglePropOnText: (id) => {
        let didChange = false;
        set((state) => {
            const el = state.elements[id];
            if (!el || el.type !== 'text')
                return state;
            if (el.prop !== undefined) {
                const { prop: _drop, ...rest } = el;
                const next = rest;
                didChange = true;
                return { elements: { ...state.elements, [id]: next } };
            }
            const used = new Set();
            for (const other of Object.values(state.elements)) {
                if (other.type === 'text' && other.prop)
                    used.add(other.prop);
            }
            let n = 1;
            while (used.has(`prop${n}`))
                n += 1;
            const newProp = `prop${n}`;
            didChange = true;
            return {
                elements: { ...state.elements, [id]: { ...el, prop: newProp } },
            };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [id],
                propertyKeys: ['prop'],
            });
        }
    },
    renamePropOnText: (id, nextName) => {
        let didChange = false;
        set((state) => {
            const el = state.elements[id];
            if (!el || el.type !== 'text' || el.prop === undefined)
                return state;
            if (el.prop === nextName)
                return state;
            didChange = true;
            return {
                elements: { ...state.elements, [id]: { ...el, prop: nextName } },
            };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [id],
                propertyKeys: ['prop'],
            });
        }
    },
    toggleSlotOnRect: (id) => {
        let didChange = false;
        set((state) => {
            const el = state.elements[id];
            if (!el || el.type !== 'rectangle')
                return state;
            // Already a slot → remove the marker.
            if (el.slot !== undefined) {
                const { slot: _drop, ...rest } = el;
                didChange = true;
                return { elements: { ...state.elements, [id]: rest } };
            }
            // A slot's JSX becomes `{slotName}`, so its own children can't be
            // emitted — forbid making a rectangle-with-children a slot.
            if (el.childIds.length > 0)
                return state;
            const used = new Set();
            for (const other of Object.values(state.elements)) {
                if (typeof other.slot === 'string' && other.slot.length > 0) {
                    used.add(other.slot);
                }
            }
            // Default the first slot to `children`; later ones get slot1/slot2/…
            let name = 'children';
            if (used.has(name)) {
                let n = 1;
                while (used.has(`slot${n}`))
                    n += 1;
                name = `slot${n}`;
            }
            didChange = true;
            return { elements: { ...state.elements, [id]: { ...el, slot: name } } };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [id],
                propertyKeys: ['slot'],
            });
        }
    },
    renameSlot: (id, nextName) => {
        let didChange = false;
        set((state) => {
            const el = state.elements[id];
            if (!el || el.type !== 'rectangle' || el.slot === undefined)
                return state;
            if (el.slot === nextName)
                return state;
            didChange = true;
            return {
                elements: { ...state.elements, [id]: { ...el, slot: nextName } },
            };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [id],
                propertyKeys: ['slot'],
            });
        }
    },
    setElementSlotName: (id, slotName) => {
        let didChange = false;
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            if (slotName === undefined) {
                if (el.slotName === undefined)
                    return state;
                const { slotName: _drop, ...rest } = el;
                didChange = true;
                return { elements: { ...state.elements, [id]: rest } };
            }
            if (el.slotName === slotName)
                return state;
            didChange = true;
            return { elements: { ...state.elements, [id]: { ...el, slotName } } };
        });
        if (didChange) {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [id],
                propertyKeys: ['slotName'],
            });
        }
    },
    moveElement: (id, x, y) => {
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            // Direct manipulation (drag-to-move) always lands on the base —
            // never on a state override, even if a state is active in the
            // panel. Moving an element on the canvas is a layout edit, not
            // a hover-state design decision.
            const next = applyPatchWithAxisRouting(el, { x, y }, state.activeBreakpointId, null);
            return { elements: { ...state.elements, [id]: next } };
        });
        // moveElement is called every pointermove tick during a drag,
        // wrapped in a beginHistoryTransaction / endHistoryTransaction
        // pair by CanvasInteractionLayer. The commit here is suppressed
        // while the transaction is open and a single `move` entry is
        // committed on pointerup.
        commitElementsToHistory({ kind: 'move', elementIds: [id] });
    },
    resizeElement: (id, x, y, width, height) => {
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            // Dragging a handle is an explicit "I want this size" gesture, so
            // we always switch to fixed mode — otherwise resizing a stretched
            // or fit-content element would silently store a value that the
            // generator wouldn't emit. Like moveElement, resize edits land
            // on the base regardless of the active state.
            const next = applyPatchWithAxisRouting(el, {
                x,
                y,
                widthValue: width,
                heightValue: height,
                widthMode: 'fixed',
                heightMode: 'fixed',
            }, state.activeBreakpointId, null);
            return { elements: { ...state.elements, [id]: next } };
        });
        // resizeElement runs every pointermove tick during a handle drag,
        // wrapped in a transaction by CanvasInteractionLayer. Per-tick
        // commits are suppressed; the wrapping endHistoryTransaction
        // records a single `resize` entry on pointerup.
        commitElementsToHistory({ kind: 'resize', elementIds: [id] });
    },
    patchElement: (id, patch) => {
        // Read-only while previewing a snapshot — drop all panel/style edits.
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        // Special-case: a rename-only patch gets a `rename` history
        // entry with the previous display name, so the panel reads
        // "Renamed old to new" instead of "Changed name — new".
        const isRenameOnly = Object.keys(patch).length === 1 && 'name' in patch;
        const beforeEl = useCanvasStore.getState().elements[id];
        const previousName = isRenameOnly && beforeEl ? classNameFor(beforeEl) : undefined;
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            const next = applyPatchWithAxisRouting(el, patch, state.activeBreakpointId, state.activeStateName);
            // A panel edit on this element triggers `generateCode` to
            // rewrite its class block from typed state, which collapses any
            // duplicate declarations the file had. Clear the indicator
            // optimistically so the user sees feedback immediately rather
            // than after the round-trip parse.
            const dupes = state.cssDuplicates;
            let nextDupes = dupes;
            if (id in dupes) {
                nextDupes = { ...dupes };
                delete nextDupes[id];
            }
            return {
                elements: { ...state.elements, [id]: next },
                cssDuplicates: nextDupes,
            };
        });
        if (isRenameOnly) {
            commitElementsToHistory({
                kind: 'rename',
                elementIds: [id],
                previousName,
            });
        }
        else {
            commitElementsToHistory({
                kind: 'patch',
                elementIds: [id],
                propertyKeys: Object.keys(patch),
            });
        }
    },
    patchCustomProperties: (id, patch) => {
        const state = useCanvasStore.getState();
        const el = state.elements[id];
        if (!el)
            return;
        // Base off the resolved element so the merge matches what the
        // panel currently shows (and what the old splat-and-delete used).
        const resolved = resolveElementAtState(el, state.activeBreakpointId, state.breakpoints, state.activeStateName);
        const next = { ...resolved.customProperties };
        for (const [key, value] of Object.entries(patch)) {
            if (value === undefined)
                delete next[key];
            else
                next[key] = value;
        }
        state.patchElement(id, { customProperties: next });
    },
    resetElementFieldsAtBreakpoint: (id, breakpointId, fields) => {
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        set((state) => {
            if (breakpointId === 'desktop')
                return state;
            const el = state.elements[id];
            if (!el || !el.breakpointOverrides)
                return state;
            const existing = el.breakpointOverrides[breakpointId];
            if (!existing)
                return state;
            const nextOverride = { ...existing };
            for (const field of fields) {
                delete nextOverride[field];
            }
            const overrides = { ...el.breakpointOverrides };
            if (Object.keys(nextOverride).length === 0) {
                // Empty override object — drop the breakpoint key so
                // generateCode won't emit an empty @media rule.
                delete overrides[breakpointId];
            }
            else {
                overrides[breakpointId] = nextOverride;
            }
            // If no breakpoints have any overrides, delete the whole field
            // so round-trips stay text-stable.
            const { breakpointOverrides: _, ...elWithoutOverrides } = el;
            const nextElement = Object.keys(overrides).length === 0
                ? elWithoutOverrides
                : { ...el, breakpointOverrides: overrides };
            return {
                elements: { ...state.elements, [id]: nextElement },
            };
        });
        commitElementsToHistory({
            kind: 'patch',
            elementIds: [id],
            propertyKeys: fields,
        });
    },
    resetElementFieldsAtState: (id, stateName, fields) => {
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        set((state) => {
            const el = state.elements[id];
            if (!el || !el.stateOverrides)
                return state;
            const existing = el.stateOverrides[stateName];
            if (!existing)
                return state;
            const nextOverride = { ...existing };
            for (const field of fields) {
                delete nextOverride[field];
            }
            const overrides = {
                ...el.stateOverrides,
            };
            if (Object.keys(nextOverride).length === 0) {
                // Empty override object — drop the state key so generateCode
                // won't emit an empty pseudo-class block.
                delete overrides[stateName];
            }
            else {
                overrides[stateName] = nextOverride;
            }
            // If no states have any overrides, delete the whole field so
            // round-trips stay text-stable.
            const { stateOverrides: _, ...elWithoutOverrides } = el;
            const nextElement = Object.keys(overrides).length === 0
                ? elWithoutOverrides
                : { ...el, stateOverrides: overrides };
            return {
                elements: { ...state.elements, [id]: nextElement },
            };
        });
        commitElementsToHistory({
            kind: 'patch',
            elementIds: [id],
            propertyKeys: fields,
        });
    },
    setAnimation: (id, animation) => {
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            // Route the animation patch through the same axis-routing the
            // panel sections use — base when default state is active, the
            // matching state override otherwise.
            const next = applyPatchWithAxisRouting(el, { animation }, state.activeBreakpointId, state.activeStateName);
            // Ensure a `KeyframesBlock` exists for the chosen name. If the
            // page already has one with this name (preset or agent-edited),
            // leave it alone — preserves user intent. If absent, append the
            // canonical preset body for known presets; for unknown names
            // we leave it absent (the agent owns those).
            let keyframes = state.pageKeyframesBlocks;
            const existing = keyframes.find((b) => b.name === animation.name);
            if (!existing && isPresetName(animation.name)) {
                const preset = PRESETS_BY_NAME.get(animation.name);
                if (preset) {
                    keyframes = [
                        ...keyframes,
                        { name: preset.name, body: preset.body, isPreset: true },
                    ];
                }
            }
            return {
                elements: { ...state.elements, [id]: next },
                pageKeyframesBlocks: keyframes,
            };
        });
        commitElementsToHistory({
            kind: 'patch',
            elementIds: [id],
            propertyKeys: ['animation'],
        });
    },
    removeAnimation: (id) => {
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            // Two cases: clear the base animation, or clear the active
            // state's animation override.
            if (state.activeStateName === null) {
                const { animation: _drop, ...rest } = el;
                const nextEl = el.animation === undefined ? el : rest;
                return { elements: { ...state.elements, [id]: nextEl } };
            }
            const overrides = el.stateOverrides;
            const stateOverride = overrides?.[state.activeStateName];
            if (!overrides || !stateOverride)
                return state;
            const { animation: _drop, ...restOverride } = stateOverride;
            const nextOverrides = {
                ...overrides,
            };
            if (Object.keys(restOverride).length === 0) {
                delete nextOverrides[state.activeStateName];
            }
            else {
                nextOverrides[state.activeStateName] = restOverride;
            }
            // Drop the whole stateOverrides field if no states remain so
            // round-trips stay text-stable.
            const { stateOverrides: _o, ...elNoStates } = el;
            const nextEl = Object.keys(nextOverrides).length === 0
                ? elNoStates
                : { ...el, stateOverrides: nextOverrides };
            return { elements: { ...state.elements, [id]: nextEl } };
        });
        commitElementsToHistory({
            kind: 'patch',
            elementIds: [id],
            propertyKeys: ['animation'],
        });
    },
    togglePropertyGroup: (id, group, on) => {
        set((state) => {
            const el = state.elements[id];
            if (!el)
                return state;
            // Compute the next list. ON means "remove the group from
            // toggledOffGroups"; OFF means "add it (if absent)".
            // `canonicalizeGroupList` sorts + dedupes so two paths to
            // the same logical state produce the same on-disk text.
            const current = el.toggledOffGroups;
            const isCurrentlyOff = current.includes(group);
            if (on && !isCurrentlyOff)
                return state; // already on
            if (!on && isCurrentlyOff)
                return state; // already off
            const next = on
                ? canonicalizeGroupList(current.filter((g) => g !== group))
                : canonicalizeGroupList([...current, group]);
            const nextEl = { ...el, toggledOffGroups: next };
            return { elements: { ...state.elements, [id]: nextEl } };
        });
        commitElementsToHistory({
            kind: 'toggle-group',
            elementIds: [id],
            toggleGroup: group,
            toggleGroupOn: on,
        });
    },
    playAnimation: (elementId) => set((state) => ({
        previewAnimation: {
            elementId,
            // Increment the key so the renderer's React `key` changes
            // even when the user clicks Play repeatedly on the same
            // element.
            key: (state.previewAnimation?.elementId === elementId
                ? state.previewAnimation.key
                : 0) + 1,
        },
    })),
});
