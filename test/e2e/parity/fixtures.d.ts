/**
 * The parity corpus.
 *
 * Each fixture is the TSX + CSS a page would have on disk, plus the same
 * markup written out as plain HTML. The canvas parses the TSX/CSS and
 * renders; a browser renders the HTML against the identical CSS. Any
 * geometry difference between them is a canvas/preview divergence.
 *
 * Hand-written rather than produced by `generateCode`, deliberately —
 * these should look like what a person or an agent writes, which is where
 * the divergences have actually come from.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */
export type ParityFixture = {
    name: string;
    /** Why this shape is worth pinning. */
    why: string;
    tsx: string;
    css: string;
    /**
     * The same markup as plain HTML, for the browser side of the comparison.
     *
     * Hand-written rather than produced by Scamp's own HTML exporter, on
     * purpose: an oracle that shares code with the thing it checks can agree
     * with it while both are wrong. `parity.spec.ts` asserts the two carry
     * the same set of element names, so they can't drift apart silently.
     */
    html: string;
    /**
     * CSS properties to compare via `getComputedStyle` on both sides. For
     * anything that produces no geometry and cannot be pixel-compared —
     * typography above all, since the two engines resolve fonts differently.
     */
    computed?: ReadonlyArray<string>;
    /**
     * Compare painted pixels as well as geometry. Only worth setting on
     * fixtures whose point is what things look like rather than where they
     * are, and they must avoid text — Electron and the standalone Chromium
     * resolve `system-ui` differently.
     */
    pixels?: boolean;
    /**
     * Components to seed on disk, exactly as Scamp would write them.
     */
    components?: ReadonlyArray<{
        name: string;
        tsx: string;
        css: string;
    }>;
    /**
     * Extra CSS for the BROWSER side only, emulating what CSS Modules do for
     * a component's stylesheet: the same rules under names that can't collide
     * with the page's. Written by hand so the oracle still shares no code
     * with the thing it checks.
     */
    truthCss?: string;
    /**
     * Set when `framework.spec.ts` can't make a fair comparison, and why. It
     * renders a fixture's component as a view on its own, so a component
     * sized by what's around it measures differently there by design.
     */
    frameworkSkip?: string;
    /**
     * Set when the canvas is known NOT to match yet. The spec asserts these
     * fail, so the gap is recorded and we're told when it closes.
     */
    knownGap?: string;
};
export declare const PARITY_FIXTURES: ReadonlyArray<ParityFixture>;
