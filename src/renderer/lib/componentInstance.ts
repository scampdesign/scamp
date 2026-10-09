import { DEFAULT_RECT_STYLES } from './defaults';
import type { ScampElement } from './element';

/**
 * A component instance on a page, and putting one in place of a subtree.
 * Pure, so the store, the Scamp Agent's headless runner and the tests
 * all build instances one way.
 */
export const makeInstanceElement = (
  input: { parentId: string; componentName: string; x: number; y: number },
  id: string
): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'component-instance',
  parentId: input.parentId,
  childIds: [],
  // The instance has no intrinsic size on the page tree — the rendered
  // component's own root sets the box. `auto` on both axes so the
  // generator emits no width/height, matching what `parseCode` produces
  // for instances without a class block.
  widthMode: 'auto',
  heightMode: 'auto',
  x: input.x,
  y: input.y,
  customProperties: {},
  componentName: input.componentName,
  // The canvas id is the hex tail of `inst_*`, so `data-scamp-instance-id`
  // is readable and easy to correlate with the selection.
  instanceId: `inst_${id}`,
  propOverrides: {},
});

/**
 * Replace a subtree with an instance of `componentName`, in the subtree
 * root's place among its siblings so flex and grid order holds. Null for
 * the page root or a missing element.
 */
export const replaceSubtreeWithInstancePure = (
  elements: Record<string, ScampElement>,
  subtreeRootId: string,
  componentName: string,
  newId: string
): Record<string, ScampElement> | null => {
  const subtreeRoot = elements[subtreeRootId];
  if (!subtreeRoot || subtreeRoot.parentId === null) return null;
  const parent = elements[subtreeRoot.parentId];
  if (!parent) return null;

  const idsToRemove = new Set<string>();
  const walk = (id: string): void => {
    if (idsToRemove.has(id)) return;
    idsToRemove.add(id);
    for (const childId of elements[id]?.childIds ?? []) walk(childId);
  };
  walk(subtreeRootId);

  const next: Record<string, ScampElement> = {};
  for (const [id, el] of Object.entries(elements)) {
    if (!idsToRemove.has(id)) next[id] = el;
  }
  next[newId] = makeInstanceElement(
    { parentId: parent.id, componentName, x: subtreeRoot.x, y: subtreeRoot.y },
    newId
  );
  const idx = parent.childIds.indexOf(subtreeRootId);
  next[parent.id] = {
    ...parent,
    childIds:
      idx < 0
        ? [...parent.childIds.filter((c) => c !== subtreeRootId), newId]
        : [...parent.childIds.slice(0, idx), newId, ...parent.childIds.slice(idx + 1)],
  };
  return next;
};
