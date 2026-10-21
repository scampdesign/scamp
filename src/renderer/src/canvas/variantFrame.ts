import { createContext } from 'react';

/**
 * Set around one frame of the variant set: the value it draws
 * (`variant=outline`, a combination, or null for the default look), and
 * whether it's read-only. Absent outside the set, where the canvas
 * follows the store's `activeVariantKey`. Inside a frame the root draws
 * at its own size, as an instance's does, rather than filling the
 * artboard. see docs/plans/component-variants-plan.md, phase 6
 */
export type VariantFrame = { variantKey: string | null; displayOnly: boolean };

export const VariantFrameContext = createContext<VariantFrame | null>(null);
