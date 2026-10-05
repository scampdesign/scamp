// store/canvas/patchRouting.ts — axis-aware patch routing, split from canvasSlice.ts (5.1).
import type {
  BreakpointOverride,
  ElementStateName,
  ScampElement,
} from '@lib/element';

/**
 * Fields that are NEVER written into a breakpoint or state override —
 * they're identity / tree / TSX-level concepts that can't
 * meaningfully change per-axis. A patch containing any of these
 * applies them to the element's top-level fields regardless of the
 * active breakpoint or state.
 */
export const BASE_ONLY_PATCH_FIELDS = new Set<keyof ScampElement>([
  'id',
  'type',
  'parentId',
  'childIds',
  'breakpointOverrides',
  'stateOverrides',
  'customSelectorBlocks',
  'tableStyle',
  'tag',
  'attributes',
  'selectOptions',
  'svgSource',
  'text',
  'name',
]);

/**
 * Apply a patch to an element while respecting the active breakpoint
 * and state. Routing rules:
 *
 *   - Desktop + default state → patch writes through to top-level.
 *   - Desktop + non-default state → style fields route to
 *     `stateOverrides[activeStateName]`.
 *   - Non-desktop + default state → style fields route to
 *     `breakpointOverrides[activeBreakpointId]`.
 *   - Non-desktop + non-default state → state×breakpoint matrix is
 *     out of scope in this version; the patch is dropped to avoid
 *     silently writing the wrong place. The properties panel UI
 *     disables non-default states at non-desktop breakpoints, so
 *     this shouldn't fire from a normal interaction.
 *
 * Identity / content fields always land on top-level regardless of
 * axis. Pure — takes the element + patch, returns the next element.
 */
/**
 * Copy a single key from one partial element to another while
 * preserving the key↔value type correlation TypeScript loses when the
 * key is a `keyof ScampElement` union (a plain `target[key] =
 * source[key]` widens both sides and errors). Generic over a single
 * `K` so the value type stays tied to the key — no `Record<string,
 * unknown>` cast needed. `stylePatch` is a `BreakpointOverride`
 * (a `Partial<Omit<ScampElement, …>>`), which is assignable to the
 * `Partial<ScampElement>` target; callers only ever pass style keys to
 * it.
 */
export const assignPatchKey = <K extends keyof ScampElement>(
  target: Partial<ScampElement>,
  source: Partial<ScampElement>,
  key: K
): void => {
  target[key] = source[key];
};

export const applyPatchWithAxisRouting = (
  el: ScampElement,
  patch: Partial<ScampElement>,
  activeBreakpointId: string,
  activeStateName: ElementStateName | null
): ScampElement => {
  // Split the patch into base (always-top-level) and style (goes to
  // override when an axis is active).
  const basePatch: Partial<ScampElement> = {};
  const stylePatch: BreakpointOverride = {};
  for (const key of Object.keys(patch) as Array<keyof ScampElement>) {
    if (BASE_ONLY_PATCH_FIELDS.has(key)) {
      assignPatchKey(basePatch, patch, key);
    } else {
      assignPatchKey(stylePatch, patch, key);
    }
  }

  const mergedBase =
    Object.keys(basePatch).length > 0 ? { ...el, ...basePatch } : el;
  const styleKeys = Object.keys(stylePatch);

  // Desktop + default state — merge style patch onto top-level.
  if (activeBreakpointId === 'desktop' && activeStateName === null) {
    if (styleKeys.length === 0) return mergedBase;
    return { ...mergedBase, ...stylePatch };
  }

  if (styleKeys.length === 0) return mergedBase;

  // Desktop + non-default state — route to stateOverrides.
  if (activeBreakpointId === 'desktop' && activeStateName !== null) {
    const existingOverride =
      mergedBase.stateOverrides?.[activeStateName] ?? {};
    const mergedCustom =
      'customProperties' in stylePatch && stylePatch.customProperties
        ? {
            ...(existingOverride.customProperties ?? {}),
            ...stylePatch.customProperties,
          }
        : existingOverride.customProperties;
    const nextOverride: BreakpointOverride = {
      ...existingOverride,
      ...stylePatch,
      ...(mergedCustom !== undefined ? { customProperties: mergedCustom } : {}),
    };
    return {
      ...mergedBase,
      stateOverrides: {
        ...mergedBase.stateOverrides,
        [activeStateName]: nextOverride,
      },
    };
  }

  // Non-desktop + non-default state — out of scope. Drop the style
  // patch; base fields already landed via mergedBase. (UI guards
  // against this combination, so this branch should be unreachable in
  // practice — kept as a safety net.)
  if (activeStateName !== null) return mergedBase;

  // Non-desktop + default state — route to breakpointOverrides.
  const existingOverride = mergedBase.breakpointOverrides?.[activeBreakpointId] ?? {};
  const mergedCustom =
    'customProperties' in stylePatch && stylePatch.customProperties
      ? {
          ...(existingOverride.customProperties ?? {}),
          ...stylePatch.customProperties,
        }
      : existingOverride.customProperties;
  const nextOverride: BreakpointOverride = {
    ...existingOverride,
    ...stylePatch,
    ...(mergedCustom !== undefined ? { customProperties: mergedCustom } : {}),
  };
  return {
    ...mergedBase,
    breakpointOverrides: {
      ...mergedBase.breakpointOverrides,
      [activeBreakpointId]: nextOverride,
    },
  };
};
