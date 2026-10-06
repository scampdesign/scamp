/**
 * The contract between the capture script and the reducer.
 *
 * Capture runs inside the page (it needs a live DOM and
 * `getComputedStyle`); the reducer is pure and runs in the renderer.
 * This module is the seam: a serializable payload, plus the policy that
 * decides which properties are worth carrying across it.
 *
 * The split matters because of size. A computed style holds 340+
 * properties per element; carrying all of them for a 2000-node page
 * would be tens of megabytes over IPC and would bury every element in
 * junk. Capture therefore filters, and the payload holds only what an
 * author plausibly set.
 *
 * ## What capture does NOT do, and why
 *
 * The plan said to diff each element against a bare probe of the same
 * tag rendered in the source document. That is wrong, and writing it
 * showed why: it answers "what did this page's author set beyond their
 * own reset", when the question is **"what must a Scamp module declare
 * to make this element look like it does here"**. A page with no reset
 * gets the UA's `<p>` margin for free; diff it away against a probe and
 * the import loses its paragraph spacing, because Scamp's own reset
 * zeroes it.
 *
 * So the source document's baseline is never consulted. Capture drops
 * only values that are universally "nothing set" (`INITIAL_VALUES`) and
 * inherited values matching the parent — inheritance behaves the same
 * in both documents, so that one IS safe. The real diff, against
 * Scamp's own baseline, happens in the reducer where `makeBaseline`
 * already knows the answer and a test can check it.
 * see docs/plans/website-import-plan.md
 */
/** Bumped when the payload shape changes, so a stale fixture fails loudly. */
export declare const CAPTURE_VERSION = 3;
/** Something the page does that Scamp's model has no room for. */
export type CaptureNoteKind = 'pseudo-element' | 'shadow-root' | 'canvas' | 'iframe' | 'svg' | 'background-image' | 'depth-capped' | 'node-capped' | 'revealed-on-scroll';
export type CaptureNote = {
    kind: CaptureNoteKind;
    /** The node it happened on, as a CSS-ish path. Absent for whole-page notes. */
    at?: string;
    /** Free text — the pseudo-element's content, the asset URL, the cap that was hit. */
    detail?: string;
};
/**
 * A `::before` / `::after` whose content is a plain string.
 *
 * Page authors use these for things that are unmistakably part of the
 * design — a "✓" on every bullet, a "+" on every collapsed FAQ row —
 * and a design tool that drops them hands back a page with its ticks
 * and its toggles missing. The reducer turns one of these into a real
 * text element, which is both visible and editable, unlike the
 * pseudo-element it came from.
 *
 * Only static text qualifies. `content: url(…)`, `counter(…)` and
 * `attr(…)` are still reported as losses: they are generated from
 * something the model has no place to keep.
 */
export type CapturedPseudo = {
    /** The content string, unquoted. */
    text: string;
    /** Computed values, filtered exactly as an element's are. */
    styles: Record<string, string>;
};
/**
 * What React says about an element, when the page is a React app in
 * development. Absent everywhere else, so an HTML import is untouched.
 * see docs/plans/react-import-plan.md
 */
export type CapturedReact = {
    /**
     * The app's own components that drew this element, nearest first: the
     * one whose render wrote its JSX, then the one that rendered that, and
     * so on. Library components (anything defined under `node_modules`)
     * are left out. Each `id` is one instance, the same across elements.
     */
    owners: Array<{
        name: string;
        id: number;
        key?: string;
    }>;
    /** The JSX call site, `/src/app/nav.tsx:102:72`. React 19 only. */
    site?: string;
    /**
     * The element's own React `key`. With the owners' keys, the sign of a
     * `.map()` where React has no call site to give (React 18): React
     * requires a key on every element of a list.
     */
    key?: string;
};
/** One component instance: its name, and its props that are plain values. */
export type CapturedReactInstance = {
    name: string;
    props: Record<string, string | number | boolean>;
};
export type CapturedNode = {
    /** Assigned by the walk, depth-first from 0. Stable within one capture. */
    id: number;
    /** Lowercased tag name. */
    tag: string;
    /**
     * Computed values for `CAPTURED_PROPERTIES`, less those equal to
     * `INITIAL_VALUES` and less inherited values matching the parent.
     * Still source-absolute: the reducer diffs against Scamp's baseline.
     */
    styles: Record<string, string>;
    /** Text content, when this node's content is only text. */
    text: string | null;
    /** Attributes worth keeping. Filtered by `KEPT_ATTRIBUTES`. */
    attrs: Record<string, string>;
    children: CapturedNode[];
    /** What this node does that Scamp can't model. */
    notes: CaptureNote[];
    /** Page-relative box. Only present when the capture asked for it. */
    rect?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** React's account of this element, on a React app in development. */
    react?: CapturedReact;
    /** Static `::before` / `::after` content, recoverable as elements. */
    pseudo?: {
        before?: CapturedPseudo;
        after?: CapturedPseudo;
    };
    /**
     * The page's own word for this thing, from its class list.
     *
     * Layer names of `box_0090` and `label_00a5` describe nothing, and
     * the page has already named everything on it. Only a class that
     * reads like a name is taken: a hash, a CSS-module mangling and a
     * layout utility all say less than the tag does.
     * see docs/notes/import-naming.md
     */
    nameHint?: string;
    /**
     * Where this node's own words sat among its element children, as the
     * index of the child they follow (`-1` before the first).
     *
     * Scamp keeps words in a text element, so a node holding both gets
     * its text lifted into a child — and that child has to land where the
     * words actually were. `<h1><span class="ico">…</span>Live capture</h1>`
     * is an icon and then a title; lifting the title to the front puts the
     * icon after it. Only present when there is text AND element children.
     */
    textAfterChildIndex?: number;
    /**
     * Structural address: `div>nav:0>ul:1>li:2`, tag plus index among
     * element siblings, all the way from the root.
     *
     * Node ids are walk order, which is useless for matching one capture
     * against another — a mobile nav appearing shifts every id after it.
     * A path is stable as long as the structure is, and when the
     * structure genuinely differs the path simply does not match, which
     * is the right answer: an element that exists at only one width has
     * no override to give.
     */
    path?: string;
    /**
     * Ordered inline content, set instead of `children` when every
     * element child is inline markup inside running text.
     *
     * `<p>Ship <strong>faster</strong> today</p>` is one paragraph, not a
     * paragraph containing a box: the `<strong>` sits in the line box and
     * moves with the words around it. Giving it its own Scamp element
     * makes it a flex item with its own metrics, which measured as the
     * single largest remaining source of layout drift — 19 of 30 elements
     * still off on one page sat inside a text element.
     *
     * `source` is JSX-safe markup, not the page's HTML: the generator
     * emits a fragment byte-for-byte into a `.tsx` file, so `class=` and
     * unknown attributes cannot come along for the ride.
     */
    inline?: Array<{
        kind: 'text';
        value: string;
    } | {
        kind: 'markup';
        source: string;
    }
    /**
     * A `<span>` that carried its own styling. `<strong>` and friends
     * survive being emitted as bare tags because the browser styles
     * them; a `<span>` stripped of its class renders as nothing at
     * all, so it comes across as a node and becomes a real element
     * sitting in the line. see docs/notes/import-inline-spans.md
     */
     | {
        kind: 'element';
        node: CapturedNode;
    }>;
    /**
     * An inline `<svg>`'s inner markup, verbatim. Scamp keeps this on the
     * element and re-emits it byte-for-byte, so an icon survives the
     * import whole instead of arriving as an empty box.
     */
    svgSource?: string;
};
/**
 * Tags that are part of a line rather than a box. Their children stay
 * inline content; they never become elements of their own inside text.
 */
export declare const INLINE_MARKUP_TAGS: ReadonlySet<string>;
/**
 * Attributes kept on inline markup, by tag. Everything else is dropped:
 * a fragment carries no class, so an attribute that only made sense
 * with the page's stylesheet would be noise in the file.
 */
/**
 * Properties that decide whether a `<span>` was doing anything.
 *
 * A span has no appearance of its own — everything it looks like comes
 * from the page's stylesheet, which the import does not carry. So a
 * span differing from its parent on any of these is carrying design,
 * and has to arrive as an element rather than as a bare `<span>` tag.
 */
/**
 * What each inline tag already gives you, and so does not need to
 * become an element to keep.
 *
 * A `<strong>` written out bare is still bold, so weight alone is no
 * reason to make an element of it. Anything a tag does NOT bring —
 * `<em>` given a 10px small-print treatment, a `<span>` given a
 * background — is design that only the page's stylesheet held, and it
 * is lost the moment the tag is emitted on its own.
 *
 * `a` and `button` bring nothing, deliberately: Scamp's own reset does
 * `all: unset` on them, so even the default link colour is gone by the
 * time the page renders. Everything they carry has to be declared.
 * see docs/notes/import-inline-spans.md
 */
export declare const INLINE_TAG_AFFORDANCES: Readonly<Record<string, ReadonlyArray<string>>>;
export declare const SPAN_VISUAL_PROPERTIES: ReadonlyArray<string>;
export declare const INLINE_MARKUP_ATTRIBUTES: Readonly<Record<string, ReadonlyArray<string>>>;
export type CapturedAsset = {
    /** Absolute URL, resolved against the page. */
    url: string;
    kind: 'image' | 'font';
    /** The node that referenced it, for the report. */
    fromNodeId: number;
};
export type CapturePayload = {
    version: typeof CAPTURE_VERSION;
    url: string;
    title: string;
    /** What the page was measured at — a style delta is only true at one width. */
    viewport: {
        width: number;
        height: number;
    };
    root: CapturedNode;
    assets: CapturedAsset[];
    /** Whole-capture notes: caps hit, and anything not tied to one node. */
    notes: CaptureNote[];
    /**
     * The page exactly as it was, before any of this module's opinions.
     *
     * The reduction is lossy by design — it has to be, to land in a model
     * far more constrained than a browser. Keeping the original next to
     * the result means the question "what did the page actually say here?"
     * has an answer, which is the difference between an agent guessing at
     * a layout and reading the rule that produced it.
     * see docs/notes/import-source-store.md
     */
    source?: CapturedSource;
    /** The React component instances named by nodes' `react.owners`, by id. */
    react?: {
        instances: Record<string, CapturedReactInstance>;
    };
};
export type CapturedSource = {
    /** `document.documentElement.outerHTML` at capture time. */
    html: string;
    /** Every stylesheet the page let us read, in document order. */
    css: string;
    /**
     * Stylesheets that threw on `cssRules` — cross-origin without CORS.
     * Recorded rather than ignored: "there was more CSS and we could not
     * see it" is the kind of thing that explains an import nobody can
     * otherwise account for.
     */
    unreadable: string[];
    /** True when either half hit `maxSourceLength` and was cut. */
    truncated: boolean;
};
/**
 * Properties the capture keeps when they differ from the baseline.
 *
 * Deliberately an allowlist, and deliberately NOT the same rule
 * `parseCode` uses. A hand-written file contains only what its author
 * meant, so keeping everything unknown is right there. A computed style
 * contains everything the UA resolved, so keeping everything unknown
 * would put 300 declarations on every element.
 *
 * The list is "what a designer would recognise as a decision". Growing
 * it is cheap; every addition should be a property someone would look
 * for in the panel and be annoyed not to find.
 */
export declare const CAPTURED_PROPERTIES: ReadonlyArray<string>;
/**
 * Values that mean "nothing is set here", by property.
 *
 * Dropping these is what keeps a payload small — a plain `<div>` emits
 * a handful of properties instead of ninety. Safe because each is the
 * CSS initial value AND what Scamp's own baseline assumes, so a
 * dropped one and an absent one mean the same thing downstream.
 *
 * `display` is deliberately absent: its initial value is `inline` but
 * it computes to `block` on a div, and both are real information.
 */
export declare const INITIAL_VALUES: Readonly<Record<string, string | ReadonlyArray<string>>>;
/**
 * Inherited properties. A value matching the parent's computed value is
 * inheritance doing its job, not a declaration, and re-emitting it on
 * every descendant is how an import ends up with `font-family` on 400
 * elements.
 */
export declare const INHERITED_PROPERTIES: ReadonlySet<string>;
/**
 * Properties whose computed value is a RESULT rather than a decision,
 * and what has to be true for them to carry information.
 *
 * Reading real captures is what produced this list, and none of it was
 * guessable: a `flex: 1 1 0` card computes `width: 442.656px`, which is
 * the layout's answer, not the author's question — declare it and the
 * card stops flexing. `border-*-color` computes to the text colour on
 * every element that has no border. `transform-origin` is derived from
 * the box on every element in the document. `box-sizing: border-box`
 * comes from the page's reset, and Scamp's own reset sets it globally
 * anyway.
 *
 * Each entry names the property that has to be present and non-initial
 * for the value to mean anything; `null` means "always a result".
 */
export declare const CONDITIONAL_PROPERTIES: Readonly<Record<string, string | null>>;
/** Attributes carried across. Everything else is page plumbing. */
export declare const KEPT_ATTRIBUTES: ReadonlySet<string>;
/**
 * Tags never worth walking into: they carry no design, or their content
 * is not markup at all.
 */
export declare const SKIPPED_TAGS: ReadonlySet<string>;
/** Caps. A payload past these is reported rather than silently truncated. */
export declare const CAPTURE_LIMITS: {
    /** Depth past which a subtree is cut. Real designs are nowhere near this. */
    readonly maxDepth: 32;
    /** Nodes past which the walk stops. A 5000-node page is not importable anyway. */
    readonly maxNodes: 4000;
    /** A single text run longer than this is truncated — almost always minified junk. */
    readonly maxTextLength: 5000;
    /**
     * Cap on each half of the kept original, in characters.
     *
     * It travels over IPC as JSON and then sits in a temp file, so it has
     * to be bounded; 4MB of markup or CSS is far past the point where
     * reading more of it tells anyone anything new.
     */
    readonly maxSourceLength: 4000000;
};
