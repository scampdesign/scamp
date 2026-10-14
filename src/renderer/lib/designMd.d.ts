import type { ThemeToken } from '@shared/types';
/**
 * DESIGN.md generation + prose parsing — a self-contained implementation of
 * the google-labs-code/design.md format: machine-readable YAML front matter
 * (auto-generated from theme tokens) plus human-readable markdown prose
 * (round-tripped from the file / the Design System forms).
 *
 * The token YAML is always regenerated from `theme.css`; only the prose
 * (name / description / section bodies) round-trips — matching the spec's
 * "tokens are authoritative, prose is authored" split.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
/** The spec's required prose section order. Empty sections are omitted. */
export declare const DESIGN_MD_SECTIONS: ReadonlyArray<string>;
export type DesignProse = {
    /** Project name → YAML `name`. */
    name?: string;
    /** Short description → YAML `description`. */
    description?: string;
    /** Markdown body per section heading (see DESIGN_MD_SECTIONS). */
    sections: Record<string, string>;
};
/**
 * Generate the full DESIGN.md content: YAML front matter from the tokens
 * plus the prose sections (in spec order). Prose meta + section bodies come
 * from `prose`; everything else is derived from `tokens`.
 */
export declare const generateDesignMd: (tokens: ReadonlyArray<ThemeToken>, prose: DesignProse) => string;
/**
 * Read the authored parts of a DESIGN.md back out: the top-level `name` /
 * `description` from the front matter and the markdown prose per section.
 * The token YAML (colors / typography / …) is intentionally ignored —
 * theme.css is authoritative for those.
 */
export declare const parseDesignMd: (content: string) => DesignProse;
