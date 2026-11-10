import postcss from 'postcss';
import { moduleClassAt } from './content';
/**
 * Edits Scamp writes itself, in milliseconds and without the agent, when
 * where they go is certain: a style edit to every instance (or the only
 * one) of an element written with `className={styles.x}`, at desktop
 * width in its normal state, into the `.x` rule of that CSS Module.
 * Everything else goes to the agent. see docs/plans/embedded-canvas-gaps.md (gap 1)
 */
// Values that could end the declaration or the rule; the agent handles anything odd.
const UNSAFE = /[;{}]|\/\*|\*\//;
/**
 * The CSS Module file and its new content, or null when the edit isn't one
 * Scamp writes itself. `read` reads a project file by its relative path.
 */
export const directStyleWrite = async (item, read) => {
    if (item.kind !== 'style' || item.state !== undefined || item.breakpoint !== undefined || (item.also?.length ?? 0) > 0)
        return null;
    const el = item.element;
    if (el.source === null || el.library !== null || (item.scope === 'instance' && el.instanceCount > 1))
        return null;
    if (item.changes.length === 0 || item.changes.some((c) => !/^[a-z-]+$/.test(c.property) || UNSAFE.test(c.to) || c.to.trim() === ''))
        return null;
    const jsx = await read(el.source.replace(/:\d+:\d+$/, ''));
    const target = jsx === null ? null : moduleClassAt(jsx, el.source);
    if (target === null)
        return null;
    const css = await read(target.file);
    if (css === null)
        return null;
    let root;
    try {
        root = postcss.parse(css);
    }
    catch {
        return null;
    }
    const rules = [];
    root.each((node) => {
        if (node.type === 'rule' && node.selector.trim() === `.${target.className}`)
            rules.push(node);
    });
    // One plain rule for the class, or it isn't certain which to change.
    // shortcut: a more specific rule elsewhere can still win over `.x`; check the page's matched rules when that bites.
    const rule = rules.length === 1 ? rules[0] : undefined;
    if (rule === undefined)
        return null;
    for (const change of item.changes) {
        const existing = rule.nodes.filter((n) => n.type === 'decl' && n.prop === change.property);
        // `initial` is how a panel edit says "back to the default": the declaration goes.
        if (change.to === 'initial') {
            existing.forEach((d) => d.remove());
            continue;
        }
        const last = existing[existing.length - 1];
        if (last === undefined)
            rule.append({ prop: change.property, value: change.to });
        else {
            existing.slice(0, -1).forEach((d) => d.remove());
            last.value = change.to;
        }
    }
    return { file: target.file, content: root.toString() };
};
