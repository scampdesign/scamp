import { createContext } from 'react';

/**
 * Set around a read-only component frame drawn in one variant value
 * (`variant=outline`, or null for the base look). Absent on the live
 * frame, which follows the store's `activeVariantKey`.
 * see docs/plans/component-variants-plan.md
 */
export type VariantFrame = { variantKey: string | null };

export const VariantFrameContext = createContext<VariantFrame | null>(null);
