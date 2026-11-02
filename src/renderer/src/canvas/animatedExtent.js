import { isHtmlNode } from './canvasDom';
/**
 * Keeping animated elements from driving the canvas extent.
 *
 * The content extent decides the fit zoom and the overflow indicator. It is
 * measured from bounding boxes, and a bounding box includes the element's
 * current transform — so an element with a running animation reports a
 * different extent depending on when you happen to look at it.
 *
 * A real project made this obvious: a hero glow with
 * `animation: glow-drift 18s infinite` translating 60px and scaling 1.08.
 * Every edit re-measured, caught the glow somewhere new, and the canvas
 * flipped between two zoom levels — 802/1440 = 55.7% at rest, 802/1474 =
 * 54.4% mid-drift — with the overflow warning appearing and vanishing
 * along with it.
 *
 * The fix is not to skip these elements: one parked off the right edge is
 * genuinely overflowing and the user needs to see that. It is to measure
 * their LAYOUT box instead — `offsetLeft`/`offsetWidth`, which ignore
 * transforms entirely and so report where the element rests rather than
 * where this frame of the animation put it.
 *
 * see docs/notes/canvas-extent-oscillation.md
 */
/**
 * A predicate for "this element is animating, or sits inside something
 * that is". Built once per measurement from a single `getAnimations()`
 * call rather than per element, and memoised up the ancestor chain.
 *
 * Descendants count because a transform on an ancestor moves them too —
 * measuring a static child of a drifting parent reads the drift.
 */
export const animatedSubtreePredicate = (root) => {
    const animated = new Set();
    // The iframe canvas's page runs its animations in its own document.
    const frames = Array.from(root.querySelectorAll('iframe'), (f) => f.contentDocument);
    const docs = [root.ownerDocument, ...frames.filter((d) => d !== null)];
    for (const animation of docs.flatMap((d) => d.getAnimations())) {
        if (animation.playState !== 'running')
            continue;
        const effect = animation.effect;
        // Only KeyframeEffect carries a target; the base AnimationEffect does not.
        const target = effect !== null && 'target' in effect
            ? effect.target
            : null;
        // `nodeType`, not `instanceof`: an iframe's nodes have their own `Element`.
        if (target !== null && target !== undefined && target.nodeType === 1)
            animated.add(target);
    }
    if (animated.size === 0)
        return () => false;
    const cache = new Map();
    const check = (el) => {
        const cached = cache.get(el);
        if (cached !== undefined)
            return cached;
        let result = animated.has(el);
        if (!result && el !== root) {
            const parent = el.parentElement;
            result = parent !== null && check(parent);
        }
        cache.set(el, result);
        return result;
    };
    return check;
};
/**
 * The element's right/bottom edge relative to `root`, in logical px, from
 * layout geometry only — no transforms, no dependence on the applied zoom.
 *
 * Returns null when the offset chain does not reach `root` (a fixed-position
 * element, or one detached mid-measure), which the caller treats as "cannot
 * attribute this one" and skips.
 */
export const layoutEdges = (el, root) => {
    let left = 0;
    let top = 0;
    let current = el;
    // Bounded by the DOM depth; the guard is against a detached node whose
    // offsetParent chain never reaches the frame.
    while (current !== null && current !== root) {
        left += current.offsetLeft;
        top += current.offsetTop;
        // From an iframe the chain ends at its body and carries on from the iframe.
        const parent = current.offsetParent ?? current.ownerDocument.defaultView?.frameElement ?? null;
        current = isHtmlNode(parent) ? parent : null;
    }
    if (current !== root)
        return null;
    return { right: left + el.offsetWidth, bottom: top + el.offsetHeight };
};
