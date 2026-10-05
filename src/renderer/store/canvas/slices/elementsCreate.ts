// store/canvas/slices/elementsCreate.ts — domain slice split from canvasSlice.ts (5.1).
import type { StateCreator } from 'zustand';
import {
  cloneElementSubtree,
  generateElementId,
  groupSiblings,
  reorderElementPure,
  reparentWithPositionPure,
  ROOT_ELEMENT_ID,
  ungroupSiblings,
  wrapElement,
  type BreakpointOverride,
  type ElementAnimation,
  type ElementStateName,
  type KeyframesBlock,
  type PropertyGroup,
  type ScampElement,
} from '@lib/element';
import { dropDrawnOffset, preserveDrawnSize } from '@lib/flexChild';
import { canonicalizeGroupList } from '@lib/propertyGroups';
import { useHistoryStore, type HistoryCommitInput } from '../../historySlice';
import { PRESETS_BY_NAME, isPresetName } from '@lib/animationPresets';
import { classNameFor } from '@lib/generateCode';
import { resolveElementAtState } from '@lib/stateCascade';
import { resolveInsertParent } from '@lib/insertParent';
import { normalizeCopySelection } from '@lib/clipboardSelection';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { DEFAULT_BODY_FONT_FAMILY } from '@shared/agentMd';
import {
  DEFAULT_BREAKPOINTS,
  type Breakpoint,
  type ProjectFormat,
  type ThemeToken,
} from '@shared/types';
import {
  defaultTextFontFamily,
  makeComponentInstance,
  makeImage,
  makeSvg,
  makeInput,
  makeRectangle,
  makeRootElement,
  makeText,
  tagForListChildContext,
} from '../factories';
import {
  BASE_ONLY_PATCH_FIELDS,
  applyPatchWithAxisRouting,
} from '../patchRouting';
import { commitElementsToHistory, freshId } from '../history';
import {
  useCanvasStore,
  type CanvasState,
  type ActivePage,
  type ActiveComponent,
  type ComponentTree,
  type PageSource,
  type Tool,
  type NewRectInput,
  type NewTextInput,
  type NewImageInput,
  type NewSvgInput,
  type NewInputInput,
  type NewComponentInstanceInput,
} from '../../canvasSlice';

/** How far a paste lands from where it was copied, matching the offset
 *  `duplicateElement` uses. Cmd+Shift+V skips it. */
const PASTE_OFFSET = 20;

export const createElementsCreateSlice: StateCreator<
  CanvasState,
  [],
  [],
  Pick<
  CanvasState,
  | 'elements'
  | 'rootElementId'
  | 'clipboard'
  | 'createRectangle'
  | 'createText'
  | 'createImage'
  | 'createSvgElement'
  | 'createInput'
  | 'insertComponentInstance'
  | 'replaceSubtreeWithInstance'
  | 'detachInstance'
  | 'renameComponentReferences'
  | 'deleteElement'
  | 'deleteElementContents'
  | 'duplicateElement'
  | 'copyElements'
  | 'cutElements'
  | 'pasteElement'
  | 'groupElements'
  | 'ungroupElement'
  | 'wrapInLinkParent'
  | 'reorderElement'
  | 'reparentElement'
>
> = (set) => ({
  elements: { [ROOT_ELEMENT_ID]: makeRootElement() },
  rootElementId: ROOT_ELEMENT_ID,
  clipboard: null,

  createRectangle: (input) => {
    const id = generateElementId();
    set((state) => {
      const parent = state.elements[input.parentId];
      if (!parent) return state;
      const contextTag = tagForListChildContext(parent);
      const newRect = makeRectangle(input, id);
      const withTag = contextTag ? { ...newRect, tag: contextTag } : newRect;
      return {
        elements: {
          ...state.elements,
          // Stored, not derived: the guard must be IN the file, or the
          // canvas (which renders the model) and the browser (which
          // renders the file) disagree about a box that has not been
          // saved yet. see docs/plans/flex-sizing-contract-plan.md
          [id]: dropDrawnOffset(preserveDrawnSize(withTag, parent), parent),
          [input.parentId]: { ...parent, childIds: [...parent.childIds, id] },
        },
        selectedElementIds: [id],
      };
    });
    commitElementsToHistory({ kind: 'draw-rect', elementIds: [id] });
    return id;
  },

  createText: (input) => {
    const id = generateElementId();
    set((state) => {
      const parent = state.elements[input.parentId];
      if (!parent) return state;
      const contextTag = tagForListChildContext(parent, 'text');
      const fontFamily = defaultTextFontFamily(state.themeTokens);
      const newText = makeText(input, id, fontFamily);
      const withTag = contextTag ? { ...newText, tag: contextTag } : newText;
      return {
        elements: {
          ...state.elements,
          [id]: dropDrawnOffset(withTag, parent),
          [input.parentId]: { ...parent, childIds: [...parent.childIds, id] },
        },
        selectedElementIds: [id],
        editingElementId: id,
      };
    });
    commitElementsToHistory({ kind: 'add-text', elementIds: [id] });
    return id;
  },

  createImage: (input) => {
    const id = generateElementId();
    set((state) => {
      const parent = state.elements[input.parentId];
      if (!parent) return state;
      const newImage = makeImage(input, id);
      return {
        elements: {
          ...state.elements,
          [id]: dropDrawnOffset(preserveDrawnSize(newImage, parent), parent),
          [input.parentId]: { ...parent, childIds: [...parent.childIds, id] },
        },
        selectedElementIds: [id],
      };
    });
    commitElementsToHistory({ kind: 'add-image', elementIds: [id] });
    return id;
  },

  createSvgElement: (input: NewSvgInput) => {
    const id = generateElementId();
    set((state) => {
      const parent = state.elements[input.parentId];
      if (!parent) return state;
      const newSvg = makeSvg(input, id);
      // SVGs scale proportionally by default (backlog-6 story 3): seed the
      // session ratio lock from the viewBox-derived width/height. The user
      // can unlock via the Size panel / on-canvas badge.
      const ratioLocks =
        input.width > 0 && input.height > 0
          ? { ...state.ratioLocks, [id]: input.width / input.height }
          : state.ratioLocks;
      return {
        elements: {
          ...state.elements,
          [id]: preserveDrawnSize(newSvg, parent),
          [input.parentId]: { ...parent, childIds: [...parent.childIds, id] },
        },
        selectedElementIds: [id],
        ratioLocks,
      };
    });
    commitElementsToHistory({ kind: 'add-image', elementIds: [id] });
    return id;
  },

  createInput: (input) => {
    const id = generateElementId();
    set((state) => {
      const parent = state.elements[input.parentId];
      if (!parent) return state;
      const newInput = makeInput(input, id);
      return {
        elements: {
          ...state.elements,
          [id]: dropDrawnOffset(preserveDrawnSize(newInput, parent), parent),
          [input.parentId]: { ...parent, childIds: [...parent.childIds, id] },
        },
        selectedElementIds: [id],
      };
    });
    commitElementsToHistory({ kind: 'add-input', elementIds: [id] });
    return id;
  },

  insertComponentInstance: (input) => {
    const id = generateElementId();
    let inserted = false;
    set((state) => {
      const parent = state.elements[input.parentId];
      if (!parent) return state;
      // Component instances render as their PascalCase JSX tag —
      // not subject to the `<li>` auto-tag rule, so we don't run
      // `tagForListChildContext` here.
      const newInstance = makeComponentInstance(input, id);
      inserted = true;
      const childIds = [...parent.childIds];
      const at =
        input.index === undefined
          ? childIds.length
          : Math.max(0, Math.min(input.index, childIds.length));
      childIds.splice(at, 0, id);
      return {
        elements: {
          ...state.elements,
          [id]: newInstance,
          [input.parentId]: { ...parent, childIds },
        },
        selectedElementIds: [id],
      };
    });
    if (!inserted) return null;
    commitElementsToHistory({
      kind: 'add-component-instance',
      elementIds: [id],
    });
    return id;
  },

  replaceSubtreeWithInstance: (subtreeRootId, componentName) => {
    const newId = generateElementId();
    let replaced = false;
    set((state) => {
      const subtreeRoot = state.elements[subtreeRootId];
      if (!subtreeRoot) return state;
      // Page-root replacement isn't meaningful — the user can't
      // convert the whole page into a component (no parent to
      // splice the instance into).
      if (subtreeRoot.parentId === null) return state;
      const parent = state.elements[subtreeRoot.parentId];
      if (!parent) return state;

      // Collect every descendant id so we can drop them from
      // the elements map in one pass. The subtree root's id is
      // included for removal too.
      const idsToRemove = new Set<string>();
      const walk = (id: string): void => {
        if (idsToRemove.has(id)) return;
        idsToRemove.add(id);
        const el = state.elements[id];
        if (!el) return;
        for (const childId of el.childIds) walk(childId);
      };
      walk(subtreeRootId);

      // Build the new element map: every surviving element kept
      // as-is, plus the new instance element. Position + sizing
      // copied from the source subtree's root so the instance
      // visually lands where the user converted from.
      const nextElements: Record<string, ScampElement> = {};
      for (const [id, el] of Object.entries(state.elements)) {
        if (idsToRemove.has(id)) continue;
        nextElements[id] = el;
      }
      const newInstance: ScampElement = makeComponentInstance(
        {
          parentId: parent.id,
          componentName,
          x: subtreeRoot.x,
          y: subtreeRoot.y,
        },
        newId
      );
      nextElements[newId] = newInstance;
      // Splice the new instance into the parent's childIds at
      // the same index as the old subtree root so source order
      // (for flex / grid layout) is preserved.
      const idx = parent.childIds.indexOf(subtreeRootId);
      const nextParentChildIds =
        idx < 0
          ? [...parent.childIds.filter((c) => c !== subtreeRootId), newId]
          : [
              ...parent.childIds.slice(0, idx),
              newId,
              ...parent.childIds.slice(idx + 1),
            ];
      nextElements[parent.id] = {
        ...parent,
        childIds: nextParentChildIds,
      };

      replaced = true;
      return {
        elements: nextElements,
        selectedElementIds: [newId],
      };
    });
    if (!replaced) return null;
    commitElementsToHistory({
      kind: 'convert-to-component',
      elementIds: [newId],
    });
    return newId;
  },

  detachInstance: (instanceId) => {
    let newRootId: string | null = null;
    let componentNameForHistory: string | undefined;
    set((state) => {
      const instance = state.elements[instanceId];
      if (!instance || instance.type !== 'component-instance') return state;
      const componentName = instance.componentName;
      if (!componentName) return state;
      const tree = state.componentTrees[componentName];
      if (!tree) return state;
      const componentRoot = tree.elements[tree.rootId];
      if (!componentRoot) return state;
      if (instance.parentId === null) return state;
      const parent = state.elements[instance.parentId];
      if (!parent) return state;

      // Two-pass clone: collect ids, assign fresh ids, rebuild refs.
      const idsToClone: string[] = [];
      const visit = (id: string): void => {
        const el = tree.elements[id];
        if (!el) return;
        idsToClone.push(id);
        for (const child of el.childIds) visit(child);
      };
      visit(tree.rootId);

      const idMap = new Map<string, string>();
      const existing = new Set(Object.keys(state.elements));
      for (const id of idsToClone) {
        // 4-hex ids collide eventually; reroll until unique.
        let next = generateElementId();
        while (existing.has(next) || [...idMap.values()].includes(next)) {
          next = generateElementId();
        }
        idMap.set(id, next);
      }

      const overrides = instance.propOverrides ?? {};
      const overrideKeys = new Set(Object.keys(overrides));

      const clonedElements: Record<string, ScampElement> = {};
      for (const oldId of idsToClone) {
        const source = tree.elements[oldId];
        if (!source) continue;
        const newId = idMap.get(oldId)!;
        const newParentId =
          oldId === tree.rootId
            ? parent.id
            : idMap.get(source.parentId ?? '') ?? null;
        const newChildIds = source.childIds
          .map((cid) => idMap.get(cid))
          .filter((cid): cid is string => typeof cid === 'string');

        // Bake propOverride → literal text; drop the `prop` field.
        let textPatch: Pick<ScampElement, 'text' | 'prop'> | null = null;
        if (
          source.type === 'text' &&
          typeof source.prop === 'string' &&
          source.prop.length > 0
        ) {
          const propName = source.prop;
          const resolved = overrideKeys.has(propName)
            ? overrides[propName]
            : source.text;
          textPatch = { text: resolved, prop: undefined };
        }

        // Clone root inherits instance x/y so layout doesn't shift.
        const positionPatch =
          oldId === tree.rootId ? { x: instance.x, y: instance.y } : {};

        const clone: ScampElement = {
          ...source,
          ...textPatch,
          ...positionPatch,
          id: newId,
          parentId: newParentId,
          childIds: newChildIds,
        };
        clonedElements[newId] = clone;
      }

      // Drop the instance from the elements map; splice the
      // clone root into the parent's childIds at the instance's
      // position so flex / grid source order is preserved.
      const { [instanceId]: _removed, ...survivors } = state.elements;
      const idx = parent.childIds.indexOf(instanceId);
      const cloneRootId = idMap.get(tree.rootId)!;
      const nextParentChildIds =
        idx < 0
          ? [...parent.childIds.filter((c) => c !== instanceId), cloneRootId]
          : [
              ...parent.childIds.slice(0, idx),
              cloneRootId,
              ...parent.childIds.slice(idx + 1),
            ];

      newRootId = cloneRootId;
      componentNameForHistory = componentName;
      return {
        elements: {
          ...survivors,
          ...clonedElements,
          [parent.id]: { ...parent, childIds: nextParentChildIds },
        },
        selectedElementIds: [cloneRootId],
      };
    });
    if (newRootId === null) return null;
    commitElementsToHistory({
      kind: 'detach-instance',
      elementIds: [newRootId],
      previousName: componentNameForHistory,
    });
    return newRootId;
  },

  renameComponentReferences: (oldName, newName) => {
    if (oldName === newName) return;
    const renamedIds: string[] = [];
    set((state) => {
      const next: Record<string, ScampElement> = {};
      for (const [id, el] of Object.entries(state.elements)) {
        if (el.type === 'component-instance' && el.componentName === oldName) {
          renamedIds.push(id);
          next[id] = { ...el, componentName: newName };
        } else {
          next[id] = el;
        }
      }
      if (renamedIds.length === 0) return state;
      // Clear inline edit if it targeted a renamed instance.
      const nextEditingInstanceProp =
        state.editingInstanceProp &&
        renamedIds.includes(state.editingInstanceProp.instanceId)
          ? null
          : state.editingInstanceProp;
      return {
        elements: next,
        editingInstanceProp: nextEditingInstanceProp,
      };
    });
    if (renamedIds.length === 0) return;
    commitElementsToHistory({
      kind: 'patch',
      elementIds: renamedIds,
      propertyKeys: ['componentName'],
    });
  },

  deleteElement: (id) => {
    // Capture the element's display name before it's removed so the
    // history entry's label can read sensibly ("Deleted hero_card_a1b2")
    // even after the element is gone from the live map.
    const beforeEl = useCanvasStore.getState().elements[id];
    const previousName = beforeEl ? classNameFor(beforeEl) : undefined;
    set((state) => {
      // Root is the page frame and can't be removed.
      if (id === ROOT_ELEMENT_ID) return state;
      const target = state.elements[id];
      if (!target) return state;

      // Collect this element + all descendants so we can drop them in one
      // pass. Walks childIds depth-first; safe because the canvas tree is
      // a tree (no cycles).
      const toRemove = new Set<string>();
      const visit = (visitId: string): void => {
        if (toRemove.has(visitId)) return;
        toRemove.add(visitId);
        const el = state.elements[visitId];
        if (!el) return;
        for (const childId of el.childIds) visit(childId);
      };
      visit(id);

      const nextElements: Record<string, ScampElement> = {};
      for (const [key, value] of Object.entries(state.elements)) {
        if (toRemove.has(key)) continue;
        nextElements[key] = value;
      }

      // Detach from parent's childIds.
      if (target.parentId) {
        const parent = nextElements[target.parentId];
        if (parent) {
          nextElements[target.parentId] = {
            ...parent,
            childIds: parent.childIds.filter((childId) => childId !== id),
          };
        }
      }

      return {
        elements: nextElements,
        selectedElementIds: state.selectedElementIds.filter((s) => !toRemove.has(s)),
        editingElementId:
          state.editingElementId && toRemove.has(state.editingElementId)
            ? null
            : state.editingElementId,
      };
    });
    commitElementsToHistory({ kind: 'delete', elementIds: [id], previousName });
  },

  deleteElementContents: (id) => {
    let didChange = false;
    set((state) => {
      const target = state.elements[id];
      if (!target) return state;

      // Nothing to clear — no child elements, no "Raw" fragments, no
      // text. Bail so we don't push an empty history entry.
      const hasText =
        typeof target.text === 'string' && target.text.length > 0;
      if (
        target.childIds.length === 0 &&
        target.inlineFragments.length === 0 &&
        !hasText
      ) {
        return state;
      }

      // Collect every descendant of the target — its children and their
      // subtrees — but NOT the target itself, which we keep. Depth-first
      // over childIds; safe because the canvas tree has no cycles.
      const toRemove = new Set<string>();
      const visit = (visitId: string): void => {
        if (toRemove.has(visitId)) return;
        toRemove.add(visitId);
        const el = state.elements[visitId];
        if (!el) return;
        for (const childId of el.childIds) visit(childId);
      };
      for (const childId of target.childIds) visit(childId);

      const nextElements: Record<string, ScampElement> = {};
      for (const [key, value] of Object.entries(state.elements)) {
        if (toRemove.has(key)) continue;
        nextElements[key] = value;
      }

      // Keep the element, emptied: drop its children, its loose inline
      // fragments, and its own text. Clearing text only when it had any
      // keeps rectangles (which never carry text) byte-stable.
      nextElements[id] = {
        ...target,
        childIds: [],
        inlineFragments: [],
        text: hasText ? '' : target.text,
      };

      didChange = true;
      return {
        elements: nextElements,
        selectedElementIds: state.selectedElementIds.filter(
          (s) => !toRemove.has(s)
        ),
        editingElementId:
          state.editingElementId && toRemove.has(state.editingElementId)
            ? null
            : state.editingElementId,
      };
    });
    if (didChange) {
      commitElementsToHistory({ kind: 'delete-contents', elementIds: [id] });
    }
  },

  duplicateElement: (id) => {
    let createdId: string | null = null;
    set((state) => {
      // Root cannot be duplicated — there's only ever one page frame.
      if (id === ROOT_ELEMENT_ID) return state;
      const original = state.elements[id];
      if (!original || !original.parentId) return state;

      const result = cloneElementSubtree(
        state.elements,
        id,
        original.parentId,
        new Set(Object.keys(state.elements))
      );
      if (!result) return state;

      const parent = state.elements[original.parentId];
      if (!parent) return state;
      const isFlexChild = parent.display === 'flex';

      // Offset the top-level clone so it's visually distinct from the
      // original. Skip the offset for flex children — flex layout owns
      // their position so x/y is meaningless. Clamp to parent bounds
      // so the duplicate doesn't escape the canvas — but when the
      // parent is root, the parent's stored widthValue/heightValue is
      // stale (root defaults to stretch/auto). Skip clamping there and
      // trust the offset.
      const cloneRoot = result.cloned[result.newId]!;
      const offset = isFlexChild ? 0 : 20;
      const parentIsRoot = parent.id === ROOT_ELEMENT_ID;
      const updatedClone = isFlexChild
        ? cloneRoot
        : parentIsRoot
          ? {
              ...cloneRoot,
              x: cloneRoot.x + offset,
              y: cloneRoot.y + offset,
            }
          : {
              ...cloneRoot,
              x: Math.min(
                Math.max(0, parent.widthValue - cloneRoot.widthValue),
                cloneRoot.x + offset
              ),
              y: Math.min(
                Math.max(0, parent.heightValue - cloneRoot.heightValue),
                cloneRoot.y + offset
              ),
            };

      // Insert the clone right after the original in childIds so it
      // appears as the next sibling — important for flex layouts where
      // sibling order is the only positioning signal.
      const idx = parent.childIds.indexOf(id);
      const insertAt = idx >= 0 ? idx + 1 : parent.childIds.length;
      const newChildIds = [...parent.childIds];
      newChildIds.splice(insertAt, 0, result.newId);
      const updatedParent: ScampElement = { ...parent, childIds: newChildIds };

      createdId = result.newId;
      return {
        elements: {
          ...state.elements,
          ...result.cloned,
          [result.newId]: updatedClone,
          [updatedParent.id]: updatedParent,
        },
        selectedElementIds: [result.newId],
      };
    });
    if (createdId !== null) {
      commitElementsToHistory({
        kind: 'duplicate',
        elementIds: [createdId],
      });
    }
    return createdId;
  },

  copyElements: (ids) => {
    set((state) => {
      const rootIds = normalizeCopySelection(
        state.elements,
        ids,
        ROOT_ELEMENT_ID
      );
      // Nothing copyable (an empty page, or only the root selected with
      // no children). Leave the existing clipboard alone — silently
      // emptying it would lose whatever the user copied before.
      if (rootIds.length === 0) return state;

      // Deep-copy the subtrees into the clipboard. Walk depth-first and
      // collect every element in each subtree keyed by its original id.
      const snapshot: Record<string, ScampElement> = {};
      const visit = (visitId: string): void => {
        const node = state.elements[visitId];
        if (!node || snapshot[visitId]) return;
        snapshot[visitId] = {
          ...node,
          customProperties: { ...node.customProperties },
          padding: [...node.padding] as [number, number, number, number],
          margin: [...node.margin] as [number, number, number, number],
          borderRadius: [...node.borderRadius] as [number, number, number, number],
          borderWidth: [...node.borderWidth] as [number, number, number, number],
        };
        for (const childId of node.childIds) visit(childId);
      };
      for (const id of rootIds) visit(id);
      return { clipboard: { elements: snapshot, rootIds } };
    });
  },

  cutElements: (ids) => {
    // Copy first, so a cut that can't remove anything still leaves the
    // clipboard in the state the user expects.
    useCanvasStore.getState().copyElements(ids);

    const before = useCanvasStore.getState();
    const targets = normalizeCopySelection(
      before.elements,
      ids,
      ROOT_ELEMENT_ID
    );
    if (targets.length === 0) return;
    const firstEl = before.elements[targets[0]!];
    const previousName = firstEl ? classNameFor(firstEl) : undefined;

    set((state) => {
      // Collect every target and its descendants in one pass, so the
      // whole cut is a single state update and a single history entry.
      const toRemove = new Set<string>();
      const visit = (visitId: string): void => {
        if (toRemove.has(visitId)) return;
        toRemove.add(visitId);
        const el = state.elements[visitId];
        if (!el) return;
        for (const childId of el.childIds) visit(childId);
      };
      for (const id of targets) visit(id);

      const nextElements: Record<string, ScampElement> = {};
      for (const [key, value] of Object.entries(state.elements)) {
        if (toRemove.has(key)) continue;
        // Detach removed children from whichever parents survive.
        nextElements[key] = value.childIds.some((c) => toRemove.has(c))
          ? { ...value, childIds: value.childIds.filter((c) => !toRemove.has(c)) }
          : value;
      }

      return {
        elements: nextElements,
        selectedElementIds: state.selectedElementIds.filter(
          (s) => !toRemove.has(s)
        ),
        editingElementId:
          state.editingElementId && toRemove.has(state.editingElementId)
            ? null
            : state.editingElementId,
      };
    });
    commitElementsToHistory({ kind: 'cut', elementIds: targets, previousName });
  },

  pasteElement: (options) => {
    let createdIds: string[] = [];
    set((state) => {
      if (!state.clipboard) return state;

      // Paste INTO the selected element as its last child — or, when the
      // selection is a leaf that can't hold children (text / image /
      // input / instance), alongside it in its nearest container
      // ancestor. Pasting into a leaf would emit invalid nesting.
      // Nothing selected pastes into the root.
      const parentId = resolveInsertParent(
        state.elements,
        state.selectedElementIds[0] ?? null,
        ROOT_ELEMENT_ID
      );
      const parent = state.elements[parentId];
      if (!parent) return state;
      const isFlexParent = parent.display === 'flex';

      // Clone each clipboard subtree with fresh IDs. `taken` accumulates
      // across the loop so two pasted subtrees can't be handed the same
      // id — cloneElementSubtree only knows about the ids it's told.
      const taken = new Set(Object.keys(state.elements));
      const cloned: Record<string, ScampElement> = {};
      const newRootIds: string[] = [];
      for (const rootId of state.clipboard.rootIds) {
        const result = cloneElementSubtree(
          state.clipboard.elements,
          rootId,
          parentId,
          taken
        );
        if (!result) continue;
        for (const id of Object.keys(result.cloned)) taken.add(id);
        Object.assign(cloned, result.cloned);
        newRootIds.push(result.newId);
      }
      if (newRootIds.length === 0) return state;

      // Position the top-level pastes. Flex parents lay their children
      // out, so x/y is meaningless there and always left alone.
      // `at` drops them at a point (right-click paste); `inPlace` keeps
      // the copied coordinates; otherwise offset so the paste doesn't
      // land exactly on top of whatever is already there.
      if (!isFlexParent) {
        for (const [i, id] of newRootIds.entries()) {
          const el = cloned[id];
          if (!el) continue;
          const at = options?.at;
          if (at) {
            // Several elements dropped at one point would stack
            // invisibly, so fan them out from it.
            const step = i * PASTE_OFFSET;
            cloned[id] = { ...el, x: at.x + step, y: at.y + step };
          } else if (options?.inPlace !== true) {
            cloned[id] = { ...el, x: el.x + PASTE_OFFSET, y: el.y + PASTE_OFFSET };
          }
        }
      }

      const updatedParent: ScampElement = {
        ...parent,
        childIds: [...parent.childIds, ...newRootIds],
      };

      createdIds = newRootIds;
      return {
        elements: {
          ...state.elements,
          ...cloned,
          [updatedParent.id]: updatedParent,
        },
        selectedElementIds: newRootIds,
      };
    });
    if (createdIds.length > 0) {
      commitElementsToHistory({
        kind: 'paste',
        elementIds: createdIds,
      });
    }
    return createdIds;
  },

  groupElements: (ids) => {
    let createdId: string | null = null;
    set((state) => {
      if (ids.length === 0) return state;
      const groupId = freshId(new Set(Object.keys(state.elements)));
      const result = groupSiblings(state.elements, ids, groupId);
      if (!result) return state;
      createdId = result.groupId;
      return {
        elements: result.elements,
        selectedElementIds: [result.groupId],
      };
    });
    if (createdId !== null) {
      commitElementsToHistory({
        kind: 'group',
        elementIds: [createdId],
      });
    }
    return createdId;
  },

  ungroupElement: (id) => {
    set((state) => {
      const result = ungroupSiblings(state.elements, id);
      if (!result) return state;
      return {
        elements: result.elements,
        selectedElementIds: result.promotedIds,
      };
    });
    commitElementsToHistory({ kind: 'ungroup', elementIds: [id] });
  },

  wrapInLinkParent: (elementId, href, options) => {
    let wrapperId: string | null = null;
    set((state) => {
      const id = freshId(new Set(Object.keys(state.elements)));
      // Build the attribute bag for the wrapper. `target='_blank'`
      // requires `rel='noopener noreferrer'` to prevent
      // window.opener exploits — caller can override via `options.rel`.
      const attributes: Record<string, string> = { href };
      if (options?.target) attributes.target = options.target;
      if (options?.rel) attributes.rel = options.rel;
      const result = wrapElement(state.elements, elementId, id, {
        tag: 'a',
        attributes,
        // `<a>` is inline by default — emit `display: block` so a
        // wrapped block-level child still renders correctly.
        customProperties: { display: 'block' },
      });
      if (!result) return state;
      wrapperId = result.wrapperId;
      return {
        elements: result.elements,
        selectedElementIds: [result.wrapperId],
      };
    });
    if (wrapperId !== null) {
      commitElementsToHistory({
        kind: 'wrap-link',
        elementIds: [elementId],
      });
    }
    return wrapperId;
  },

  reorderElement: (elementId, newParentId, newIndex) => {
    set((state) => {
      const next = reorderElementPure(state.elements, elementId, newParentId, newIndex);
      if (!next) return state;
      return { elements: next };
    });
    commitElementsToHistory({ kind: 'reorder', elementIds: [elementId] });
  },

  reparentElement: (elementId, newParentId, newIndex, pos) => {
    // `pos` set → dropping onto an absolute container: reparent and
    // write x/y. `pos` omitted → flow (flex/grid) target where layout
    // owns position, so this is a plain reorder. Skip the history
    // commit when the pure fn rejects the move (root / cycle / missing)
    // so an invalid drop leaves no entry.
    let changed = false;
    set((state) => {
      const next =
        pos === undefined
          ? reorderElementPure(state.elements, elementId, newParentId, newIndex)
          : reparentWithPositionPure(
              state.elements,
              elementId,
              newParentId,
              newIndex,
              pos.x,
              pos.y
            );
      if (!next) return state;
      changed = true;
      return { elements: next };
    });
    if (changed) {
      commitElementsToHistory({ kind: 'reorder', elementIds: [elementId] });
    }
  },

});
