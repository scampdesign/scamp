import { CAPTURE_VERSION, INHERITED_PROPERTIES, } from '@shared/importCapture';
import { ROOT_ELEMENT_ID } from './element';
import { makeBaseline, applyDeclarations, applyDeclarationsAsOverride } from './parseCode/apply';
import { jsxAttributeName, svgSourceToJsx } from './svgJsx';
import { isStyled, mergeRuns, textFromRuns, } from './textRuns';
/**
 * Tags that become a text element. Mirrors `parseCode`'s own list —
 * a text element is one whose content is words rather than layout, and
 * the two lists have to agree or an element's words are written once
 * and then dropped as a rectangle's on the next save.
 *
 * The inline run — `b`, `i`, `sup`, `mark` and the rest — is here
 * because a rectangle carries no text at all: `<b>iQ</b>` came out as
 * an empty `<b />`, which is how a wordmark lost two thirds of itself.
 * They only reach this list at all now that a flex or grid host's
 * children are elements rather than one verbatim run.
 * see docs/notes/import-inline-spans.md
 */
const TEXT_TAGS = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'label',
    'blockquote', 'pre', 'code', 'strong', 'em', 'small', 'time',
    'figcaption', 'legend', 'li', 'button', 'th', 'td', 'caption',
    'b', 'i', 'u', 's', 'sub', 'sup', 'mark', 'abbr', 'cite', 'q',
    'kbd', 'samp', 'var', 'del', 'ins', 'dt', 'dd', 'summary',
]);
const IMAGE_TAGS = new Set(['img', 'video', 'iframe', 'svg']);
const INPUT_TAGS = new Set(['input', 'textarea', 'select']);
/**
 * A property that, present on a node, means the node is doing something
 * visible and must not be collapsed away.
 */
const VISUAL_PROPERTIES = [
    'background-color', 'background-image', 'opacity', 'box-shadow', 'filter',
    'backdrop-filter', 'mix-blend-mode', 'transform',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'position', 'z-index', 'overflow-x', 'overflow-y',
    'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio',
];
/** A display value that means the node is arranging its children. */
const LAYOUT_DISPLAYS = new Set([
    'flex', 'inline-flex', 'grid', 'inline-grid',
]);
/**
 * Displays with no equivalent in the model, kept verbatim but reported.
 *
 * `list-item` is deliberately NOT here. It is an ordinary block that
 * also draws a marker, the flow translation handles it like any other
 * block, and Scamp models `list-style` directly — reporting every `<li>`
 * on a page as an unsupported layout was 19 false alarms on one site
 * and buried the real ones.
 */
const UNSUPPORTED_DISPLAYS = new Set([
    'table', 'table-row', 'table-cell', 'table-header-group',
    'table-row-group', 'table-footer-group', 'table-column',
    'inline-table', 'contents',
]);
const elementTypeFor = (tag) => {
    if (IMAGE_TAGS.has(tag))
        return 'image';
    if (INPUT_TAGS.has(tag))
        return 'input';
    return TEXT_TAGS.has(tag) ? 'text' : 'rectangle';
};
/** Displays whose children flow inline rather than stacking. */
const INLINE_DISPLAYS = new Set([
    'inline', 'inline-block', 'inline-flex', 'inline-grid', 'inline-table',
]);
/**
 * Give a block container the flex layout that matches how it already
 * behaves, because Scamp has no model for block flow.
 *
 * This is the difference between an import that looks like the page and
 * one that looks like every element piled at the origin. Scamp emits
 * `position: absolute; left: 0; top: 0` for a child of a parent that
 * isn't a layout container — inside a flex or grid parent the child is
 * in flow, and outside one it is pinned. The web's default is block
 * flow, so on a real page MOST containers are neither flex nor grid,
 * and importing them as-is pins nearly everything. Measured on two real
 * sites: 56% and 28% of rules absolutely positioned before this, 4% and
 * 4% after — the rest being genuinely absolute or sticky.
 *
 * Block flow stacking children down the page IS `flex-direction:
 * column` with the default `align-items: stretch`. A container whose
 * children are all inline is the row case. Neither is a perfect
 * translation — floats and inline text wrapping have no equivalent —
 * but both are enormously closer than absolute.
 */
const flowLayoutFor = (node) => {
    const display = node.styles['display'] ?? 'block';
    if (LAYOUT_DISPLAYS.has(display))
        return null;
    if (node.children.length === 0)
        return null;
    // A text element holds inline content — words that wrap and sit on a
    // baseline. Making it a flex container turns each word-run into a
    // flex item, which loses the wrapping and the line box: a 81x43
    // paragraph came back 304x100.
    //
    // …but only where there are words to wrap. A text-tagged node with
    // element children and no text of its own is a container whatever
    // its tag says — a `<span>` used as a 34x34 icon box, say — and
    // without a layout Scamp pins its children at 0,0 and lets the box
    // collapse to nothing around them.
    if (elementTypeFor(node.tag) === 'text' && (node.text !== null || node.inline !== undefined)) {
        return null;
    }
    // `inline` on the parent means it is part of a line, not building one.
    if (display === 'inline')
        return null;
    const childDisplays = node.children.map((c) => c.styles['display'] ?? 'block');
    const allInline = childDisplays.every((d) => INLINE_DISPLAYS.has(d));
    return allInline
        ? { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'align-items': 'center' }
        : { display: 'flex', 'flex-direction': 'column' };
};
/** Does this node make a visible difference beyond holding its children? */
const isVisuallyMeaningful = (node) => {
    if (VISUAL_PROPERTIES.some((p) => p in node.styles))
        return true;
    if (LAYOUT_DISPLAYS.has(node.styles['display'] ?? ''))
        return true;
    if (node.text !== null)
        return true;
    if (Object.keys(node.attrs).length > 0)
        return true;
    if (node.notes.length > 0)
        return true;
    // Its `::before` is about to become a real child; collapsing the
    // node now would take the element that holds it with it.
    if (node.pseudo !== undefined)
        return true;
    return false;
};
/**
 * Remove wrappers that hold exactly one child and decide nothing.
 *
 * Conservative by choice: one child only, and only when the node has no
 * visual property, no layout display, no text, no attributes and no
 * notes. A wrapper that centres its child with flex is doing real work
 * and stays, even though it looks redundant in the layers panel.
 */
/**
 * Tags a wrapper can be written with and still mean nothing.
 *
 * `<div>` was the whole list, which left the other half of the idiom
 * standing: one page arrived with about 25 spare `<span>`s around group
 * labels, nav icons and breadcrumbs. A `<span>` used as a box is as
 * empty a wrapper as a `<div>`, and the conditions around this set are
 * what make the removal safe — one child, no visual property, no layout
 * display, no text, no attributes, no notes, no pseudo-element.
 *
 * Nothing semantic is here on purpose. A `<nav>` or a `<section>` says
 * something about the page even when it paints nothing.
 */
const COLLAPSIBLE_TAGS = new Set(['div', 'span']);
const collapse = (node, findings, path, 
/** The view's root is never collapsed away: the tree has to have one. */
isRoot = false) => {
    const here = [...path, node.tag];
    let current = {
        ...node,
        children: node.children.map((c) => collapse(c, findings, here)),
    };
    if (isRoot)
        return current;
    while (current.children.length === 1 &&
        !isVisuallyMeaningful(current) &&
        COLLAPSIBLE_TAGS.has(current.tag)) {
        const only = current.children[0];
        if (only === undefined)
            break;
        findings.push({
            kind: 'collapsed-wrapper',
            at: here.join(' > '),
            detail: `<div> around <${only.tag}>`,
        });
        current = only;
    }
    return current;
};
/**
 * Drop a size that the layout produced rather than the author chose.
 *
 * A node with element children is sized by its content and its parent;
 * pinning the measured pixels is how an import turns into a rigid
 * screenshot. A leaf keeps its size, because an image or a spacer with
 * an explicit box is usually the point.
 *
 * This is the conservative reading. The precise answer needs the
 * authored rules rather than the computed ones, which is a phase-2
 * question — see the plan's note on `document.styleSheets`.
 */
/**
 * Drop a size only when the layout would produce it anyway.
 *
 * The first version of this dropped width and height from every element
 * with children, on the principle that a computed value is not a
 * decision. Measured, that cost 20 points of fidelity — 92% of elements
 * within 2px of the source became 72% — because plenty of those widths
 * WERE decisions, and a dropped one becomes a guess.
 *
 * The measured box tells the two apart. An element whose width matches
 * the space its parent gave it was filling, and `stretch` reproduces
 * that at any width; one that is narrower chose to be, and the number
 * has to be kept. Same for height against its content.
 *
 * So the rule is not "prefer flexible" or "prefer faithful" — it is
 * "declare what the page decided, and let flow do the rest".
 */
const dropComputedSizes = (node, parentRect, findings, at) => {
    const styles = node.styles;
    const rect = node.rect;
    const next = { ...styles };
    const dropped = [];
    // A text element's height is NEVER a decision. It is
    // f(width, font, content), and of those three only two survive an
    // import — the typeface may load late, may be substituted, or may
    // simply render with different metrics here. Pin the measured height
    // and the moment the text needs one more line it spills out of its
    // box and over whatever is below it, which is what "the titles
    // overlay the text" turned out to be: 100 of 101 text elements on one
    // page carried a fixed height, one of them the model's 100px default
    // rather than any measurement at all.
    //
    // It also hid itself from the fidelity harness, which compares boxes:
    // a pinned box measures exactly right while its content pours out of
    // it. Overflow is checked separately now.
    // …but only where there are words. A `<span>` with no text of its
    // own is not running text at all, whatever its tag says: a 34x34
    // icon box with `line-height: 0` is a square someone chose, and
    // dropping its height collapsed it onto its own contents.
    const holdsWords = node.text !== null || node.inline !== undefined;
    if (elementTypeFor(node.tag) === 'text' && holdsWords) {
        // Round a text box's width UP, never down. Scamp's model is whole
        // pixels (`parseSizeValue` rounds), so a measured `129.484px` would
        // land at `129px` — a fraction narrower than the words it was
        // measured around. Rounding up costs at most a pixel of width;
        // rounding down risks a whole extra line of height.
        const measured = next['width'];
        if (typeof measured === 'string' && measured.endsWith('px')) {
            const value = Number.parseFloat(measured);
            if (Number.isFinite(value) && !Number.isInteger(value)) {
                next['width'] = `${Math.ceil(value)}px`;
            }
        }
        // Height only. Width is a CONSTRAINT — it decides where the words
        // wrap, and changing it changes the layout materially: dropping it
        // too measured 100% of elements within 2px down to 66%. Height is
        // the CONSEQUENCE of that width, and the one that cannot survive a
        // font substitution.
        if ('height' in next) {
            findings.push({ kind: 'dropped-computed-size', at, detail: `height: ${next['height']}` });
            delete next['height'];
        }
        // Pushed whether or not there was a value to delete, so the mode is
        // set explicitly rather than falling back to the model's 100px —
        // which is where one element's nonsense 100px-tall heading came
        // from.
        dropped.push('height');
    }
    // Everything else keeps a size it chose. A leaf with an explicit box —
    // an image, a spacer — is usually the point of that element.
    if (node.children.length === 0 || !rect || !parentRect) {
        return { styles: next, dropped };
    }
    // Within a pixel of the parent's content box: this element was
    // filling, not sizing itself.
    const fills = Math.abs(rect.w - parentRect.w) <= 1;
    if (fills && 'width' in next) {
        findings.push({ kind: 'dropped-computed-size', at, detail: `width: ${next['width']}` });
        delete next['width'];
        dropped.push('width');
    }
    // A height equal to the children's extent is the content's, not a
    // decision; anything else (a min-height, a fixed hero) is kept.
    const childExtent = node.children.reduce((max, c) => (c.rect ? Math.max(max, c.rect.y + c.rect.h - rect.y) : max), 0);
    if (childExtent > 0 && Math.abs(rect.h - childExtent) <= 1 && 'height' in next) {
        findings.push({ kind: 'dropped-computed-size', at, detail: `height: ${next['height']}` });
        delete next['height'];
        dropped.push('height');
    }
    return { styles: next, dropped };
};
/**
 * Properties measured off `document.body` that describe the VIEWPORT
 * rather than the design: the capture was taken at 1440x900, so body
 * reports exactly that. Carrying them onto the view's root pins it to
 * the window the import happened in.
 */
const VIEWPORT_DERIVED = [
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'overflow-x', 'overflow-y',
];
/**
 * `margin: 0 auto` — the centring idiom — computes to equal pixel
 * margins at the captured width. Importing those pins the element to
 * one viewport size, and it is the single most common layout idiom on
 * the web, so getting it wrong is visible on nearly every page.
 *
 * Equal non-zero left and right margins on an element that also has a
 * `max-width` is that idiom with near-certainty: a designer setting
 * literal matching side margins would have no reason to cap the width
 * too.
 */
const restoreAutoMargins = (styles, findings, at) => {
    const left = styles['margin-left'];
    const right = styles['margin-right'];
    if (left === undefined || left !== right)
        return styles;
    if (left === '0px' || !('max-width' in styles))
        return styles;
    findings.push({ kind: 'restored-auto-margin', at, detail: left });
    return { ...styles, 'margin-left': 'auto', 'margin-right': 'auto' };
};
/**
 * A captured inline run as the model's `text` + `inlineFragments`.
 *
 * The generator emits a text element as: its `text`, then every
 * fragment whose `afterChildIndex` is -1, in array order. So a leading
 * text run becomes `text` and everything after it becomes fragments,
 * which reproduces the source order exactly.
 */
/**
 * The inherited values an element declares, for copying onto a child
 * created after the capture.
 *
 * `list-style-type` is left behind: only a list item draws a marker,
 * and none of these children is one.
 */
const inheritedTypography = (styles) => {
    const out = {};
    for (const prop of INHERITED_PROPERTIES) {
        if (prop === 'list-style-type')
            continue;
        const value = styles[prop];
        if (value !== undefined)
            out[prop] = value;
    }
    return out;
};
/**
 * Properties a span can carry and still be a RUN rather than an element.
 *
 * Only what paints glyphs. A span with padding, a background box, a
 * border or `display: inline-block` is a box in the line and has to stay
 * an element — the page's `.mark` is exactly that, and turning it into a
 * run would drop everything but its colour.
 * see docs/plans/inline-spans-plan.md
 */
const RUNNABLE_PROPERTIES = new Set([
    'color',
    'font-weight',
    'font-style',
    'text-decoration-line',
    'background-image',
    'background-clip',
    '-webkit-background-clip',
    '-webkit-text-fill-color',
    'display',
    // `auto` is the ABSENCE of a size, not a box property — and the
    // inline pass writes both onto every span it keeps. Checked for the
    // value below: a real width makes it a box.
    'width',
    'height',
]);
/** Can this span be a styled run instead of an element in the line? */
const isRunnableSpan = (node) => {
    if (node.children.length > 0 || node.inline !== undefined)
        return false;
    if (node.text === null || node.text.length === 0)
        return false;
    // Any attribute makes it a thing in its own right — a link, an id
    // something references, a data attribute an agent wrote.
    if (Object.keys(node.attrs).length > 0)
        return false;
    if (node.pseudo !== undefined || node.svgSource !== undefined)
        return false;
    for (const prop of Object.keys(node.styles)) {
        if (!RUNNABLE_PROPERTIES.has(prop))
            return false;
    }
    // `display` is allowed through only as an inline value: `inline-block`
    // is a box, whatever else it carries.
    const display = node.styles['display'];
    if (display !== undefined && display !== 'inline')
        return false;
    for (const prop of ['width', 'height']) {
        const value = node.styles[prop];
        if (value !== undefined && value !== 'auto')
            return false;
    }
    return true;
};
/** A captured span's styles as a run style. */
const runStyleOf = (styles) => {
    const style = {};
    if (styles['color'] !== undefined)
        style.color = styles['color'];
    if (styles['font-style'] !== undefined)
        style.fontStyle = styles['font-style'];
    if (styles['text-decoration-line'] !== undefined) {
        style.textDecorationLine = styles['text-decoration-line'];
    }
    const weight = styles['font-weight'];
    if (weight !== undefined) {
        const n = Number.parseInt(weight, 10);
        if (Number.isFinite(n))
            style.fontWeight = n;
    }
    if (styles['background-image'] !== undefined) {
        style.backgroundImage = styles['background-image'];
        // Gradient text: the fill is transparent so the background shows
        // through the glyphs. Carried explicitly, because a run that kept
        // the image without it paints a box behind the words.
        // The fill that reveals the gradient. A page writes it either as
        // `-webkit-text-fill-color` or by making `color` transparent, and
        // both have to survive: without it the image paints a box behind
        // the words instead of through them.
        const fill = styles['-webkit-text-fill-color'];
        if (fill !== undefined)
            style.color = fill;
    }
    return style;
};
const inlineToFragments = (host, inline) => {
    const items = [...inline];
    // A host with children cannot also hold words — that is the rule
    // `needsTextChild` exists for, and the generator drops the text
    // rather than render both. So once one span in the run becomes an
    // element, every text run has to become one too, and the host is
    // left a pure container whose children flow as a line.
    //
    // With no element in the run nothing changes: the leading text stays
    // on the host and the rest stay fragments, exactly as before.
    const hasElement = items.some((item) => item.kind === 'element');
    // Every styled span in the line can be a RUN: keep the sentence as
    // ONE text element instead of splitting it into siblings. That split
    // is what forced the words apart, which is what lost the spaces
    // between them, and what made an imported headline three layers
    // nobody can edit as a sentence.
    // see docs/plans/inline-spans-plan.md
    if (hasElement &&
        // `markup` is verbatim source and cannot be a run — it is kept
        // whole precisely because nothing understands its insides.
        items.every((item) => item.kind === 'text' ||
            (item.kind === 'element' && isRunnableSpan(item.node)))) {
        const last = items.length - 1;
        const runs = [];
        for (const [index, item] of items.entries()) {
            if (item.kind === 'text') {
                let value = item.value.replace(/\s+/g, ' ');
                if (index === 0)
                    value = value.replace(/^ /, '');
                if (index === last)
                    value = value.replace(/ $/, '');
                if (value.length > 0)
                    runs.push({ text: value });
                continue;
            }
            if (item.kind !== 'element')
                continue;
            const style = runStyleOf(item.node.styles);
            runs.push(Object.keys(style).length > 0
                ? { text: item.node.text ?? '', style }
                : { text: item.node.text ?? '' });
        }
        const merged = mergeRuns(runs);
        return {
            text: textFromRuns(merged),
            fragments: [],
            children: [],
            // One plain run is what a plain text element already is.
            ...(merged.length === 1 && !isStyled(merged[0])
                ? {}
                : { runs: merged }),
        };
    }
    let text = null;
    if (!hasElement && items[0]?.kind === 'text') {
        text = items[0].value.trim();
        items.shift();
    }
    const fragments = [];
    const children = [];
    // `afterChildIndex` places a run relative to the children around it,
    // so it has to track the elements as they are added — a run before
    // the first one is -1, which is also where a run with no elements
    // beside it belongs.
    let afterChildIndex = -1;
    /** A run of words as a child that sits in the line. */
    const wordsAsChild = (value) => ({
        // Negative so it never collides with a captured node's id, and so
        // anything looking a source node up by it simply misses: there is
        // no source node, this run was part of its parent's text.
        id: -1 - children.length,
        tag: 'span',
        styles: {
            ...inheritedTypography(host.styles),
            display: 'inline',
            position: 'static',
            width: 'auto',
            height: 'auto',
        },
        text: value,
        attrs: {},
        children: [],
        notes: [],
    });
    // Collapse each run's whitespace the way CSS does, and keep the space
    // at a run's EDGE. Trimming every run destroyed the spaces around an
    // inline span: `works <span>alongside</span> AI.` came back as
    // `worksalongsideAI.`, because the two text runs are
    // `"…works "` and `" AI."` and both boundary spaces live there.
    //
    // Only the outermost edges are trimmed, which is what a line box does
    // to its own leading and trailing space.
    //
    // **This is correct and currently has no effect.** `makeBaseline` in
    // parseCode/apply.ts trims every text element, because the model has
    // nowhere to keep a leading or trailing space and the round trip
    // depends on that. The space computed here is discarded there. Kept
    // because it is the half that belongs in this file, and because the
    // fix for the other half needs it. see docs/plans/inline-spans-plan.md
    // Trimmed at the line's own edges, which is ITEM position, not text
    // position. Using the first and last TEXT run instead collapsed the
    // gap in `<b>a</b> <i>b</i>` to nothing: that run is the only text,
    // so it counted as both edges and lost the space that IS its content.
    const runText = (value, index) => {
        let out = value.replace(/\s+/g, ' ');
        if (index === 0)
            out = out.replace(/^ /, '');
        if (index === items.length - 1)
            out = out.replace(/ $/, '');
        return out;
    };
    for (const [index, item] of items.entries()) {
        if (hasElement && item.kind === 'text') {
            const value = runText(item.value, index);
            // A run that is ONLY a space still matters — it is the gap in
            // `<b>a</b> <i>b</i>` — so the test is emptiness, not blankness.
            if (value.length > 0) {
                children.push(wordsAsChild(value));
                afterChildIndex += 1;
            }
            continue;
        }
        if (item.kind === 'element') {
            children.push({
                ...item.node,
                styles: {
                    ...inheritedTypography(host.styles),
                    ...item.node.styles,
                    // A child of a text host is `position: absolute` by Scamp's
                    // tree-shape rule unless it says otherwise, which would lift
                    // the span out of the sentence and pin it at 0,0. `static`
                    // is the typed escape hatch that leaves it in the line, and
                    // a span that positions itself keeps what it asked for.
                    position: item.node.styles['position'] ?? 'static',
                    // An inline box hugs its words. A measured width would
                    // decide where they wrap instead of the line doing it.
                    width: 'auto',
                    height: 'auto',
                },
            });
            afterChildIndex += 1;
            continue;
        }
        fragments.push(item.kind === 'text'
            ? { kind: 'text', value: item.value, afterChildIndex }
            : { kind: 'jsx', source: item.source, afterChildIndex });
    }
    return { text, fragments, children };
};
/**
 * The styles an element is built from, after every translation this
 * module makes: block flow becomes flex, centring becomes auto margins,
 * and the root sheds the viewport it was measured in.
 *
 * Shared with the breakpoint diff on purpose, and it is not an
 * optimisation. A narrow capture compared against UNnormalised base
 * styles reports every translation as a difference — most damagingly
 * `display`, where the base reads `flex` (this module put it there) and
 * the narrow capture reads `block`. Scamp models only flex and grid, so
 * `block` lands on its "not a layout container" sentinel, which is the
 * string `none` — and an override of `display: none` is emitted
 * verbatim. The result was every block container on the page
 * disappearing at tablet and mobile: a blank canvas, from a diff that
 * was measuring its own work.
 */
/** A track list that is nothing but pixel lengths, as numbers. */
const pxTracks = (value) => {
    const parts = value.trim().split(/\s+/);
    const out = [];
    for (const part of parts) {
        if (!/^-?\d+(?:\.\d+)?px$/.test(part))
            return null;
        out.push(Number.parseFloat(part));
    }
    return out.length > 0 ? out : null;
};
const edgeTotal = (styles, props) => props.reduce((sum, prop) => sum + (Number.parseFloat(styles[prop] ?? '0') || 0), 0);
/**
 * Grid templates are read back as used values, never as what was
 * written: `1fr 1fr` computes to `548.094px 495.891px` and `auto` rows
 * compute to the height the content happened to take. Declaring either
 * pins the grid to the window the capture ran in — the same "a
 * computed value is not a decision" rule the module applies to `width`
 * and `height`, one level down.
 *
 * Rows go, always: a row track list of bare pixels is a measurement.
 * Columns only go when they FILL the content box, which is what tells
 * a `1fr 1fr` that got measured apart from a `280px 1fr` sidebar the
 * author really did write in pixels. When they fill, the proportions
 * are the decision, so they come back as `fr`.
 */
const normalizeGridTracks = (node, styles, findings, at) => {
    const display = styles['display'];
    if (display !== 'grid' && display !== 'inline-grid')
        return styles;
    const next = { ...styles };
    const rows = next['grid-template-rows'];
    if (rows !== undefined && pxTracks(rows) !== null) {
        findings.push({ kind: 'dropped-computed-size', at, detail: `grid-template-rows: ${rows}` });
        delete next['grid-template-rows'];
    }
    const columns = next['grid-template-columns'];
    const tracks = columns === undefined ? null : pxTracks(columns);
    if (columns === undefined || tracks === null || !node.rect)
        return next;
    const gap = Number.parseFloat(next['column-gap'] ?? next['gap'] ?? '0') || 0;
    const content = node.rect.w -
        edgeTotal(next, [
            'padding-left', 'padding-right', 'border-left-width', 'border-right-width',
        ]);
    const total = tracks.reduce((a, b) => a + b, 0);
    const used = total + gap * (tracks.length - 1);
    if (Math.abs(used - content) > 1)
        return next;
    // Relative to the narrowest track, so an even grid reads `1fr 1fr`
    // rather than a pair of decimals nobody can check by eye.
    const min = Math.min(...tracks);
    if (min <= 0)
        return next;
    next['grid-template-columns'] = tracks
        .map((track) => `${Math.round((track / min) * 1000) / 1000}fr`)
        .join(' ');
    findings.push({ kind: 'grid-tracks-to-fr', at, detail: columns });
    return next;
};
/**
 * Sets of longhands Scamp models as one typed value.
 *
 * `getComputedStyle` only ever reports longhands, so a capture carries
 * `padding-top` … `padding-left` and never `padding`. Scamp maps the
 * SHORTHAND to its typed field and has no mapper for the sides, so all
 * four fell through to `customProperties` — emitted verbatim, invisible
 * to the properties panel, and four lines where one would do. One real
 * page produced 834 of them and a 87KB stylesheet.
 */
const SHORTHAND_SETS = [
    { shorthand: 'padding', sides: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
    { shorthand: 'margin', sides: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
    {
        shorthand: 'border-width',
        sides: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    },
    {
        shorthand: 'border-style',
        sides: ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    },
    {
        shorthand: 'border-color',
        sides: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    },
    {
        shorthand: 'border-radius',
        sides: [
            'border-top-left-radius',
            'border-top-right-radius',
            'border-bottom-right-radius',
            'border-bottom-left-radius',
        ],
    },
];
/** `10px 10px 10px 10px` → `10px`; `1px 2px 1px 2px` → `1px 2px`. */
const collapseSides = ([top, right, bottom, left]) => {
    if (top === bottom && right === left) {
        return top === right ? `${top}` : `${top} ${right}`;
    }
    if (right === left)
        return `${top} ${right} ${bottom}`;
    return `${top} ${right} ${bottom} ${left}`;
};
/**
 * Fold every complete longhand set into the shorthand, so the values
 * land in Scamp's typed fields instead of `customProperties`.
 *
 * Only when all four sides are present: a partial set is a value the
 * page set on one edge, and writing a shorthand would invent the other
 * three.
 */
const foldShorthands = (styles) => {
    let next = styles;
    for (const { shorthand, sides } of SHORTHAND_SETS) {
        if (shorthand in next)
            continue;
        const values = sides.map((side) => next[side]);
        if (values.some((value) => value === undefined))
            continue;
        if (next === styles)
            next = { ...styles };
        next[shorthand] = collapseSides(values);
        for (const side of sides)
            delete next[side];
    }
    return next;
};
const normalizedStyles = (node, isRoot, findings, at) => {
    const flow = flowLayoutFor(node);
    if (flow !== null) {
        findings.push({ kind: 'block-to-flex', at, detail: flow['flex-direction'] });
    }
    let styles = flow === null ? node.styles : { ...node.styles, ...flow };
    styles = restoreAutoMargins(styles, findings, at);
    styles = normalizeGridTracks(node, styles, findings, at);
    styles = foldShorthands(styles);
    if (isRoot) {
        const rootStyles = { ...styles };
        for (const prop of VIEWPORT_DERIVED)
            delete rootStyles[prop];
        styles = rootStyles;
    }
    return styles;
};
/** `styles` as the declaration list `applyDeclarations` expects. */
const toDeclarations = (styles) => Object.entries(styles).map(([prop, value]) => ({ prop, value }));
/**
 * A readable class prefix from the tag and its role, so the layers
 * panel reads like a design rather than a DOM dump.
 */
/**
 * Prefixes `parseCode` reads as a type before it looks at the tag.
 * A name from the page that starts with one would re-type the element
 * on the next load.
 */
const RESERVED_NAME_PREFIX = /^(text|rect|img|input)(_|$)/;
const NAME_FOR_TAG = {
    nav: 'nav', header: 'header', footer: 'footer', main: 'main',
    section: 'section', article: 'card', aside: 'aside', figure: 'figure',
    ul: 'list', ol: 'list', li: 'item', img: 'image', button: 'button',
    svg: 'icon', video: 'video', iframe: 'embed',
    a: 'link', h1: 'title', h2: 'heading', h3: 'subheading',
    p: 'text', span: 'label', form: 'form', input: 'field',
    strong: 'bold', b: 'bold', em: 'italic', i: 'italic',
    sup: 'sup', sub: 'sub', mark: 'mark', code: 'code',
    abbr: 'abbr', cite: 'cite', q: 'quote', kbd: 'key',
    del: 'deleted', ins: 'inserted', dt: 'term', dd: 'definition',
    summary: 'summary', small: 'small', time: 'time',
};
/** PascalCase view name from a page title, falling back to `Imported`. */
export const viewNameFromTitle = (title) => {
    const words = title
        .replace(/[^A-Za-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .slice(0, 3);
    if (words.length === 0)
        return 'Imported';
    const name = words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('');
    return /^[0-9]/.test(name) ? `Imported${name}` : name;
};
/**
 * Fold captures taken at narrower widths into breakpoint overrides.
 *
 * Pure, and separate from `reduceCapture` on purpose: a base import
 * must not depend on the narrow captures succeeding, and a page whose
 * mobile layout is a different DOM should still import its desktop one.
 *
 * Elements are matched by structural path, never by id — ids are walk
 * order, and a mobile menu appearing shifts every one after it. A path
 * that does not appear at the narrow width means the element is not
 * there, which is not an override but an absence, and Scamp has no way
 * to say "gone below 768px". Those are counted and reported rather than
 * guessed at.
 * see docs/plans/website-import-plan.md
 */
/**
 * Push inherited typography down onto the elements that render words.
 *
 * The capture drops a property inheritance already supplies; Scamp
 * emits typography only on text elements. Together those lose the font
 * entirely. see docs/notes/import-inherited-typography.md
 */
export const resolveInheritance = (root) => {
    const walk = (node, from) => {
        const styles = { ...node.styles };
        // Anything that renders words needs them, including a container
        // whose bare text gets lifted into a text child further down.
        if (elementTypeFor(node.tag) === 'text' || node.text !== null) {
            for (const [prop, value] of Object.entries(from)) {
                if (!(prop in styles))
                    styles[prop] = value;
            }
        }
        const down = { ...from };
        for (const prop of INHERITED_PROPERTIES) {
            const own = node.styles[prop];
            if (own !== undefined)
                down[prop] = own;
        }
        return {
            ...node,
            styles,
            children: node.children.map((child) => walk(child, down)),
        };
    };
    return walk(root, {});
};
/**
 * Turn a recovered `::before` / `::after` into a real text element.
 *
 * A page's ticks and toggles are usually pseudo-elements — a "✓" on
 * every bullet, a "+" on every collapsed row — and dropping them hands
 * back a design with its punctuation missing. Scamp has no
 * pseudo-elements, but it does have text elements, and a text element
 * is the better answer anyway: you can see it in the layers panel and
 * change it.
 *
 * The host's own words move into a child of their own at the same
 * time, so the order is `[::before, the words, children, ::after]`.
 * Without that the recovered glyph lands after the text it was meant
 * to precede.
 *
 * Runs AFTER `collapse`, so a wrapper is judged on what the page gave
 * it rather than on children this pass invented, and after
 * `resolveInheritance`, which is why each synthesized child is handed
 * the host's inherited typography explicitly here.
 * see docs/notes/import-inherited-typography.md
 */
export const materializePseudos = (root, findings) => {
    let maxId = 0;
    const scan = (node) => {
        maxId = Math.max(maxId, node.id);
        node.children.forEach(scan);
    };
    scan(root);
    const nextNodeId = () => {
        maxId += 1;
        return maxId;
    };
    const spanFor = (host, styles, suffix) => ({
        id: nextNodeId(),
        tag: 'span',
        // No measured box: a pseudo-element has no `getBoundingClientRect`,
        // and a lifted run of words should hug them. Without this both
        // land on the model's 100x100 default.
        styles: { width: 'auto', height: 'auto', ...inheritedTypography(host.styles), ...styles },
        text: null,
        attrs: {},
        children: [],
        notes: [],
        ...(host.path === undefined ? {} : { path: `${host.path}${suffix}` }),
    });
    const walk = (node) => {
        const children = node.children.map(walk);
        const pseudo = node.pseudo;
        if (pseudo === undefined || (pseudo.before === undefined && pseudo.after === undefined)) {
            return { ...node, children };
        }
        const at = node.path ?? node.tag;
        const made = (p, which) => {
            findings.push({ kind: 'pseudo-materialized', at: `${at}::${which}`, detail: p.text });
            return { ...spanFor(node, p.styles, `::${which}`), text: p.text };
        };
        const next = [];
        if (pseudo.before !== undefined)
            next.push(made(pseudo.before, 'before'));
        // The host's own content becomes a sibling of the glyph rather than
        // staying on the host, which is what puts it in the right order.
        if (node.text !== null || node.inline !== undefined) {
            const content = spanFor(node, {}, '>text');
            next.push({
                ...content,
                text: node.text,
                ...(node.inline === undefined ? {} : { inline: node.inline }),
            });
        }
        next.push(...children);
        if (pseudo.after !== undefined)
            next.push(made(pseudo.after, 'after'));
        const { pseudo: _removed, inline: _inline, ...rest } = node;
        // The host now has children, and a host with no layout pins every
        // child at 0,0 — the glyph printed on top of the words. Direction
        // follows the glyph: one taken out of flow (the `position:
        // absolute; left: 0` custom-bullet idiom) leaves the words to
        // stack as block flow did, while one still in flow sat beside
        // them on a line.
        const display = rest.styles['display'] ?? 'block';
        const styles = { ...rest.styles };
        if (!LAYOUT_DISPLAYS.has(display)) {
            const glyphs = [pseudo.before, pseudo.after].filter((g) => g !== undefined);
            const inFlow = glyphs.some((g) => {
                const p = g.styles['position'];
                return p !== 'absolute' && p !== 'fixed';
            });
            styles['display'] = INLINE_DISPLAYS.has(display) ? 'inline-flex' : 'flex';
            styles['flex-direction'] = inFlow ? 'row' : 'column';
            if (inFlow)
                styles['align-items'] = 'baseline';
        }
        return { ...rest, styles, text: null, children: next };
    };
    return walk(root);
};
export const applyBreakpointCaptures = (base, narrower) => {
    let elements = base.elements;
    const findings = [...base.findings];
    for (const { breakpointId, payload } of narrower) {
        const byPath = new Map();
        const index = (node) => {
            if (node.path !== undefined)
                byPath.set(node.path, node);
            node.children.forEach(index);
        };
        index(materializePseudos(resolveInheritance(payload.root), []));
        let changed = 0;
        let absent = 0;
        const next = { ...elements };
        for (const [id, element] of Object.entries(elements)) {
            const path = base.sourcePaths[id];
            if (path === undefined)
                continue;
            const narrow = byPath.get(path);
            if (narrow === undefined) {
                absent += 1;
                continue;
            }
            // Normalised the same way the base was, or the diff measures this
            // module's own translations rather than the page's media queries.
            const narrowStyles = normalizedStyles(narrow, id === ROOT_ELEMENT_ID, [], '');
            // Only the declarations that actually differ at this width. A
            // width that merely re-measured is not an override — the same
            // "computed value is not a decision" rule as the base capture.
            const declarations = [];
            for (const [prop, value] of Object.entries(narrowStyles)) {
                if (prop === 'width' || prop === 'height')
                    continue;
                if (baseStyleOf(base, id, prop) === value)
                    continue;
                declarations.push({ prop, value });
            }
            if (declarations.length === 0)
                continue;
            const override = applyDeclarationsAsOverride(declarations);
            if (Object.keys(override).length === 0)
                continue;
            next[id] = {
                ...element,
                breakpointOverrides: {
                    ...(element.breakpointOverrides ?? {}),
                    [breakpointId]: override,
                },
            };
            changed += 1;
        }
        elements = next;
        if (changed > 0) {
            findings.push({
                kind: 'breakpoint-captured',
                at: breakpointId,
                detail: `${changed} elements`,
                count: changed,
            });
        }
        if (absent > 0) {
            findings.push({
                kind: 'breakpoint-absent',
                at: breakpointId,
                detail: `${absent} elements`,
                count: absent,
            });
        }
    }
    return { ...base, elements, findings };
};
/** The base capture's value for one property on one element. */
const baseStyleOf = (base, id, prop) => base.baseStyles[id]?.[prop];
/** Reduce a captured page to an element tree. Pure. */
export const reduceCapture = (payload, options = {}) => {
    if (payload.version !== CAPTURE_VERSION) {
        throw new Error(`Capture payload is version ${payload.version}; this build reads ${CAPTURE_VERSION}.`);
    }
    const findings = [];
    // Capture's own notes come first: they describe the source page, and
    // they are the things Scamp cannot represent at all.
    const collectNotes = (node) => {
        for (const note of node.notes)
            findings.push({ ...note });
        node.children.forEach(collectNotes);
    };
    collectNotes(payload.root);
    for (const note of payload.notes)
        findings.push({ ...note });
    const pruned = materializePseudos(collapse(resolveInheritance(payload.root), findings, [], true), findings);
    let counter = 0;
    const fallbackId = () => {
        counter += 1;
        return counter.toString(16).padStart(4, '0');
    };
    const nextId = options.randomId ?? fallbackId;
    const elements = {};
    const sourceNodes = {};
    const sourcePaths = {};
    const baseStyles = {};
    const used = new Set([ROOT_ELEMENT_ID]);
    const build = (node, parentId, path, parentIsLayout, 
    /** How the parent arranges this child: down the page, or across it. */
    parentFlow, 
    /** The parent's measured box, for telling "filling" from "sized". */
    parentRect) => {
        const isRoot = parentId === null;
        const at = [...path, node.tag].join(' > ');
        let id = ROOT_ELEMENT_ID;
        if (!isRoot) {
            do {
                id = nextId();
            } while (used.has(id));
            used.add(id);
        }
        // Running text with inline markup in it stays one element: the
        // markup becomes fragments rather than boxes. see `inlineToFragments`
        const inlineRun = node.inline ? inlineToFragments(node, node.inline) : null;
        // A tag whose words have moved into children is a CONTAINER, not a
        // text element. The canvas renders a text element's `text` and
        // ignores its children, so typing it text makes every one of them
        // invisible while the layers panel and the code still list them.
        //
        // `parseCode` already corrects this on the way in — but not when the
        // class name pins the type, and `text_` does. So the name has to
        // stop saying `text` as well, or a reload does not fix it either.
        // see docs/notes/import-inline-spans.md
        const tagType = elementTypeFor(node.tag);
        const childCount = (inlineRun?.children.length ?? 0) + node.children.length;
        const isContainer = tagType === 'text' && childCount > 0;
        // …and the mirror of it: a tag Scamp reads as a box whose only
        // content is words IS a text element, whatever the tag says. The
        // generator emits `text` for text elements alone, so a
        // `<div>Clinical iQ > AI Recorder</div>` was written out as an
        // empty div — the words gone, with nothing in the report to say so.
        const isTextLeaf = tagType === 'rectangle' &&
            childCount === 0 &&
            node.inline === undefined &&
            node.text !== null;
        const type = isContainer ? 'rectangle' : isTextLeaf ? 'text' : tagType;
        // The class prefix has to agree with the type, because `parseCode`
        // reads it before it looks at the tag: `text_` pins a text element,
        // and anything else lets the tag decide.
        const tagName = NAME_FOR_TAG[node.tag] ?? 'box';
        // The page's own word for it, where it had one. `nav_item_001b`
        // beats `box_001b` in the layers panel and in the stylesheet, and
        // the capture already rejected anything that reads like a hash.
        //
        // A prefix Scamp reserves is dropped rather than used: `parseCode`
        // reads `text_`, `rect_`, `img_` and `input_` as the element's TYPE
        // before it looks at the tag, so a class called `rect-grid` on a
        // text element would come back a rectangle.
        const hint = node.nameHint !== undefined && !RESERVED_NAME_PREFIX.test(node.nameHint)
            ? node.nameHint
            : null;
        const name = isRoot
            ? null
            : isTextLeaf
                ? // Still has to start with `text` to pin the type, since the
                    // tag on its own says box. `text_page_sub` reads fine.
                    hint === null
                        ? 'text'
                        : `text_${hint}`
                : (hint ?? (isContainer && tagName === 'text' ? 'box' : tagName));
        const className = isRoot ? ROOT_ELEMENT_ID : `${name}_${id}`;
        if (inlineRun !== null) {
            findings.push({
                kind: 'inline-kept',
                at,
                detail: `${node.inline?.length ?? 0} runs`,
            });
        }
        // Scamp's rule: words live in a text element, never loose in a
        // container. A node with both text and element children gets the
        // text lifted into a child of its own.
        const hasElementChildren = node.children.length > 0;
        const needsTextChild = inlineRun === null && node.text !== null && hasElementChildren;
        const host = node;
        const sized = dropComputedSizes(host, parentRect, findings, at);
        const styles = normalizedStyles({ ...host, styles: sized.styles }, isRoot, findings, at);
        const display = styles['display'];
        if (display !== undefined && UNSUPPORTED_DISPLAYS.has(display)) {
            findings.push({ kind: 'unsupported-display', at, detail: display });
        }
        const raw = {
            id,
            type,
            // `document.body` is the capture's root; a Scamp root is a div.
            tag: isRoot ? 'div' : node.tag,
            className,
            parentId,
            childIds: [],
            text: inlineRun !== null ? inlineRun.text : needsTextChild ? null : node.text,
            inlineFragments: inlineRun !== null ? inlineRun.fragments : [],
            name,
            src: type === 'image' && node.tag === 'img' ? (node.attrs['src'] ?? null) : null,
            alt: type === 'image' && node.tag === 'img' ? (node.attrs['alt'] ?? '') : null,
            // Spelled the way React spells them: a captured `datetime` is
            // invalid JSX, and the file it lands in is compiled.
            attributes: Object.fromEntries(Object.entries(node.attrs)
                .filter(([k]) => !(type === 'image' && node.tag === 'img' && (k === 'src' || k === 'alt')))
                .map(([k, v]) => [jsxAttributeName(k), v])),
            svgSource: node.svgSource === undefined ? null : svgSourceToJsx(node.svgSource),
            selectOptions: null,
            componentName: null,
            instanceId: null,
            propOverrides: null,
            missingComponent: false,
            bind: null,
            on: null,
            repeat: null,
            showIf: null,
            range: null,
        };
        const baseline = makeBaseline(raw, true);
        const withStyles = applyDeclarations(baseline, toDeclarations(styles), parentIsLayout);
        // `makeBaseline` builds from the PARSER's raw shape, whose runs
        // carry a class rather than a style — so ours are attached here,
        // the same way `parseCode/index.ts` attaches its own once the CSS
        // is in hand. see docs/plans/inline-spans-plan.md
        const element = inlineRun?.runs === undefined
            ? withStyles
            : { ...withStyles, runs: inlineRun.runs };
        // A size that was a layout result needs the mode that reproduces how
        // the element got that size, not merely the absence of a number.
        //
        // Width and height are not symmetrical in flow. A block-level
        // element FILLS its container's width and takes its height from its
        // content — so a dropped width becomes `stretch` and a dropped
        // height becomes `auto`. Setting both to `auto` makes every
        // container hug its contents, which measured as a 1200px row
        // arriving 510px wide.
        const autoSized = {};
        if (sized.dropped.includes('width')) {
            // Down a column, a child fills the cross axis — that is what
            // `align-items: stretch` does, and what block flow does. Across a
            // row, its width is its content's. Keying this off the element's
            // own display instead measured worse than not doing it at all.
            const display = node.styles['display'] ?? 'block';
            autoSized.widthMode =
                parentFlow === 'row' || INLINE_DISPLAYS.has(display) ? 'auto' : 'stretch';
        }
        if (sized.dropped.includes('height'))
            autoSized.heightMode = 'auto';
        const selfIsLayoutForText = LAYOUT_DISPLAYS.has(display ?? '');
        // What this element does to ITS children, after the flow rewrite.
        const ownFlow = (styles['flex-direction'] ?? 'row').startsWith('column') ||
            display === 'grid' ||
            display === 'inline-grid'
            ? 'column'
            : 'row';
        const childIds = [];
        let liftedTextId = null;
        if (needsTextChild) {
            const textId = (() => {
                let candidate = nextId();
                while (used.has(candidate))
                    candidate = nextId();
                used.add(candidate);
                return candidate;
            })();
            findings.push({ kind: 'wrapped-bare-text', at, detail: node.text ?? '' });
            const textRaw = {
                ...raw,
                id: textId,
                type: 'text',
                tag: 'span',
                className: `text_${textId}`,
                parentId: id,
                name: 'text',
                text: node.text,
                src: null,
                alt: null,
                attributes: {},
            };
            // It renders its parent's words, so it needs the type they were
            // set in — and a box that fits them. With neither, it landed on
            // the model's 100x100 default: a blank square shoving the real
            // content aside, in the browser's default face.
            const lifted = [{ prop: 'width', value: 'auto' }, { prop: 'height', value: 'auto' }];
            for (const prop of INHERITED_PROPERTIES) {
                const value = styles[prop];
                if (value !== undefined)
                    lifted.push({ prop, value });
            }
            elements[textId] = applyDeclarations(makeBaseline(textRaw, true), lifted, selfIsLayoutForText);
            liftedTextId = textId;
        }
        const selfIsLayout = LAYOUT_DISPLAYS.has(display ?? '');
        // The lifted words go back where they were, not at the front. An
        // `<h1>` that reads icon-then-title had the title lifted ahead of
        // its own icon. see `textAfterChildIndex`
        const wordsAfter = node.textAfterChildIndex ?? -1;
        if (liftedTextId !== null && wordsAfter < 0)
            childIds.push(liftedTextId);
        // An inline host's styled spans are its children. The capture
        // leaves `node.children` empty for such a host, so these are the
        // only ones, and their order is the order of the line.
        const built = [...(inlineRun?.children ?? []), ...node.children];
        built.forEach((child, index) => {
            childIds.push(build(child, id, [...path, node.tag], selfIsLayout, ownFlow, node.rect ?? null));
            if (liftedTextId !== null && wordsAfter === index)
                childIds.push(liftedTextId);
        });
        // A recorded position past the last child still has to land.
        if (liftedTextId !== null && !childIds.includes(liftedTextId)) {
            childIds.push(liftedTextId);
        }
        elements[id] = { ...element, ...autoSized, childIds };
        sourceNodes[id] = node.id;
        if (node.path !== undefined)
            sourcePaths[id] = node.path;
        baseStyles[id] = styles;
        return id;
    };
    build(pruned, null, [], false, 'column', null);
    return {
        elements,
        rootId: ROOT_ELEMENT_ID,
        findings,
        suggestedName: viewNameFromTitle(payload.title),
        sourceNodes,
        sourcePaths,
        baseStyles,
    };
};
