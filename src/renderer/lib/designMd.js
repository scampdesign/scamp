import { buildTextStyles } from './typographyModel';
import { tokensForRole } from './tokenRoles';
import { resolveTokenChain } from './resolveToken';
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
export const DESIGN_MD_SECTIONS = [
    'Overview',
    'Colors',
    'Typography',
    'Layout',
    'Elevation & Depth',
    'Shapes',
    'Components',
    "Do's and Don'ts",
];
// A semantic colour token that points at another `--color-*` becomes a
// `{colors.<name>}` reference in the YAML (the spec's token-ref syntax).
const COLOR_VAR_RE = /^var\(\s*--color-([\w-]+)\s*\)$/;
/** Quote a YAML scalar only when it contains structurally-significant chars. */
const yamlScalar = (raw) => {
    const s = raw.trim();
    if (s === '' ||
        /[:#{}[\],"'&*!|>%@`]/.test(s) ||
        /^[-?\s]/.test(s) ||
        /\s$/.test(s)) {
        return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return s;
};
const colorEntries = (tokens) => tokens
    .filter((t) => t.name.startsWith('--color-'))
    .map((t) => {
    const key = t.name.slice('--color-'.length);
    const ref = t.value.match(COLOR_VAR_RE);
    return [key, ref && ref[1] ? `{colors.${ref[1]}}` : t.value];
});
const roleEntries = (role, tokens) => tokensForRole(role, tokens).map((t) => [t.label, t.value]);
/** Text styles → typography objects with resolved concrete values. */
const typographyEntries = (tokens) => {
    const keyFor = {
        family: 'fontFamily',
        size: 'fontSize',
        weight: 'fontWeight',
        leading: 'lineHeight',
        tracking: 'letterSpacing',
    };
    const resolve = (v) => resolveTokenChain(v, tokens) ?? v;
    return buildTextStyles(tokens).map((style) => {
        const props = [];
        ['family', 'size', 'weight', 'leading', 'tracking']
            .forEach((p) => {
            const raw = style[p];
            if (raw !== null)
                props.push([keyFor[p], resolve(raw)]);
        });
        return [style.name, props];
    });
};
const emitMap = (key, entries, lines) => {
    if (entries.length === 0)
        return;
    lines.push(`${key}:`);
    for (const [k, v] of entries)
        lines.push(`  ${yamlScalar(k)}: ${yamlScalar(v)}`);
};
/**
 * Generate the full DESIGN.md content: YAML front matter from the tokens
 * plus the prose sections (in spec order). Prose meta + section bodies come
 * from `prose`; everything else is derived from `tokens`.
 */
export const generateDesignMd = (tokens, prose) => {
    const yaml = [];
    if (prose.name && prose.name.trim() !== '')
        yaml.push(`name: ${yamlScalar(prose.name)}`);
    if (prose.description && prose.description.trim() !== '')
        yaml.push(`description: ${yamlScalar(prose.description)}`);
    emitMap('colors', colorEntries(tokens), yaml);
    const typo = typographyEntries(tokens);
    if (typo.length > 0) {
        yaml.push('typography:');
        for (const [name, props] of typo) {
            yaml.push(`  ${yamlScalar(name)}:`);
            for (const [k, v] of props)
                yaml.push(`    ${k}: ${yamlScalar(v)}`);
        }
    }
    emitMap('rounded', roleEntries('radius', tokens), yaml);
    emitMap('spacing', roleEntries('spacing', tokens), yaml);
    const parts = ['---', ...yaml, '---', ''];
    for (const section of DESIGN_MD_SECTIONS) {
        const body = prose.sections[section]?.trim();
        if (body)
            parts.push(`## ${section}`, '', body, '');
    }
    return parts.join('\n').replace(/\n+$/, '\n');
};
const unquote = (v) => {
    const s = v.trim();
    if ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return s;
};
/**
 * Read the authored parts of a DESIGN.md back out: the top-level `name` /
 * `description` from the front matter and the markdown prose per section.
 * The token YAML (colors / typography / …) is intentionally ignored —
 * theme.css is authoritative for those.
 */
export const parseDesignMd = (content) => {
    const sections = {};
    if (typeof content !== 'string' || content.trim() === '') {
        return { sections };
    }
    const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
    const front = fm ? (fm[1] ?? '') : '';
    const body = fm ? content.slice(fm[0].length) : content;
    const topLevel = (field) => {
        const m = front.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
        return m && m[1] !== undefined ? unquote(m[1]) : undefined;
    };
    const name = topLevel('name');
    const description = topLevel('description');
    // Split the markdown body into `## Heading` → body chunks. Each chunk
    // runs from just after its heading line to the start of the next heading.
    const re = /^##\s+(.+?)\s*$/gm;
    let match;
    const heads = [];
    while ((match = re.exec(body)) !== null) {
        heads.push({
            title: match[1] ?? '',
            headStart: match.index,
            bodyStart: match.index + match[0].length,
        });
    }
    heads.forEach((h, i) => {
        const next = heads[i + 1];
        const end = next ? next.headStart : body.length;
        sections[h.title] = body.slice(h.bodyStart, end).trim();
    });
    return {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        sections,
    };
};
