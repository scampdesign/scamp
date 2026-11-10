import { parse } from '@babel/parser';
const MAX_HOPS = 3;
const parseFile = (code, file) => {
    try {
        // The program, not the File around it: imports and top-level consts are its body.
        return parse(code, {
            sourceType: 'module',
            errorRecovery: true,
            plugins: /\.tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
        }).program;
    }
    catch {
        return null;
    }
};
const isNode = (v) => typeof v === 'object' && v !== null && typeof v.type === 'string';
/** Every node with its chain of ancestors, outermost first. */
const walk = (root, visit) => {
    const go = (node, ancestors) => {
        if (visit(node, ancestors) === true)
            return true;
        const next = [...ancestors, node];
        for (const key of Object.keys(node)) {
            if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments')
                continue;
            const value = node[key];
            const kids = Array.isArray(value) ? value : [value];
            for (const kid of kids)
                if (isNode(kid) && go(kid, next))
                    return true;
        }
        return false;
    };
    go(root, []);
};
/** The JSX element whose opening tag starts at `line`:`column` (1-based), with its ancestors. */
const elementAt = (root, line, column) => {
    let found = null;
    walk(root, (node, ancestors) => {
        if (node.type !== 'JSXElement')
            return;
        const opening = node['openingElement'];
        const at = opening?.loc?.start;
        if (at !== undefined && at.line === line && at.column + 1 === column) {
            found = { element: node, ancestors };
            return true;
        }
    });
    return found;
};
const splitSource = (source) => {
    const m = /^(.+):(\d+):(\d+)$/.exec(source);
    return m === null ? null : { file: m[1] ?? '', line: Number(m[2]), column: Number(m[3]) };
};
const where = (file, node) => `${file}:${node.loc?.start.line ?? 0}`;
/** A string an expression is, when it's written as one: `"x"`, `'x'`, or a template with no `${}`. */
const literalString = (node) => {
    if (node === undefined)
        return null;
    if (node.type === 'StringLiteral')
        return String(node['value']);
    if (node.type === 'TemplateLiteral' && node['expressions'].length === 0) {
        const quasis = node['quasis'];
        return quasis.map((q) => q.value.cooked).join('');
    }
    return null;
};
/** The name a component function is declared under: `function Card`, `const Card = () =>`. */
const componentName = (fn, parent) => {
    const id = fn['id'];
    if (id?.type === 'Identifier')
        return String(id['name']);
    if (parent?.type === 'VariableDeclarator') {
        const vid = parent['id'];
        if (vid?.type === 'Identifier')
            return String(vid['name']);
    }
    return null;
};
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
/** What an expression in the element's JSX is: a literal, a prop of its component, an import, or data. */
const resolveExpression = (expr, ancestors, program, file) => {
    const literal = literalString(expr);
    if (literal !== null)
        return { kind: 'literal', value: literal, at: where(file, expr) };
    // `props.title`, with `props` the component's first parameter.
    if (expr.type === 'MemberExpression' && expr['object'].type === 'Identifier' && expr['property'].type === 'Identifier' && expr['computed'] !== true) {
        const object = String(expr['object']['name']);
        const prop = String(expr['property']['name']);
        for (let i = ancestors.length - 1; i >= 0; i -= 1) {
            const fn = ancestors[i];
            if (fn === undefined || !FUNCTIONS.has(fn.type))
                continue;
            const first = fn['params'][0];
            if (first?.type === 'Identifier' && first['name'] === object) {
                const name = componentName(fn, ancestors[i - 1]);
                return name === null ? { kind: 'data', reason: 'it’s an expression' } : { kind: 'prop', prop, component: name };
            }
        }
        return { kind: 'data', reason: 'it’s an expression' };
    }
    if (expr.type !== 'Identifier')
        return { kind: 'data', reason: 'it’s an expression' };
    const name = String(expr['name']);
    // The nearest function that binds the name: a component's destructured prop, or a callback's item (data).
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
        const fn = ancestors[i];
        if (fn === undefined || !FUNCTIONS.has(fn.type))
            continue;
        const params = fn['params'];
        const first = params[0];
        const destructured = first?.type === 'ObjectPattern' &&
            first['properties'].some((p) => {
                if (p.type !== 'ObjectProperty')
                    return false;
                const value = p['value'];
                const bound = value.type === 'AssignmentPattern' ? value['left'] : value;
                return bound.type === 'Identifier' && bound['name'] === name;
            });
        if (destructured) {
            const component = componentName(fn, ancestors[i - 1]);
            return component === null ? { kind: 'data', reason: 'it comes from a function’s arguments' } : { kind: 'prop', prop: name, component };
        }
        if (params.some((p) => p.type === 'Identifier' && p['name'] === name))
            return { kind: 'data', reason: 'it comes from data, such as a list being drawn' };
        // A `const` written with a string, in the component.
        const body = fn['body'];
        const local = constString(body, name, file);
        if (local !== null)
            return local;
    }
    const top = constString(program, name, file) ?? importOf(program, name, file);
    return top ?? { kind: 'data', reason: 'it comes from a variable' };
};
const constString = (scope, name, file) => {
    const statements = scope['body'] ?? [];
    if (!Array.isArray(statements))
        return null;
    for (const st of statements) {
        const decl = st.type === 'ExportNamedDeclaration' ? st['declaration'] : st;
        if (decl?.type !== 'VariableDeclaration' || decl['kind'] !== 'const')
            continue;
        for (const d of decl['declarations']) {
            const id = d['id'];
            if (id.type !== 'Identifier' || id['name'] !== name)
                continue;
            const value = literalString(d['init']);
            return value === null ? { kind: 'data', reason: 'it comes from a variable' } : { kind: 'literal', value, at: where(file, d) };
        }
    }
    return null;
};
const importOf = (program, name, file) => {
    for (const st of program['body']) {
        if (st.type !== 'ImportDeclaration')
            continue;
        for (const spec of st['specifiers']) {
            if (spec['local']['name'] === name)
                return { kind: 'import', value: String(st['source']['value']), at: where(file, st) };
        }
    }
    return null;
};
/** The element's text, when it's only text or one expression; null when it has elements inside. */
const textOf = (element) => {
    const kids = element['children'].filter((k) => !(k.type === 'JSXText' && String(k['value']).trim() === ''));
    if (kids.length === 0)
        return 'empty';
    if (kids.every((k) => k.type === 'JSXText'))
        return 'text';
    if (kids.length === 1 && kids[0]?.type === 'JSXExpressionContainer')
        return kids[0]['expression'];
    return 'mixed';
};
const attributeOf = (element, name) => {
    const attrs = element['openingElement']['attributes'];
    const attr = attrs.find((a) => a.type === 'JSXAttribute' && a['name']['name'] === name);
    if (attr !== undefined) {
        const value = attr['value'];
        if (value === null)
            return { type: 'StringLiteral', value: '' };
        return value.type === 'JSXExpressionContainer' ? value['expression'] : value;
    }
    return attrs.some((a) => a.type === 'JSXSpreadAttribute') ? 'spread' : 'missing';
};
/** One step: the content of `field` on the element at `source`. */
const contentAt = async (query, source, field, attrName) => {
    const at = splitSource(source);
    if (at === null)
        return { kind: 'data', reason: 'Scamp couldn’t find where it’s written' };
    const code = await query.read(at.file);
    const program = code === null ? null : parseFile(code, at.file);
    const hit = program === null ? null : elementAt(program, at.line, at.column);
    if (program === null || hit === null)
        return { kind: 'data', reason: 'Scamp couldn’t read the code there' };
    const { element, ancestors } = hit;
    // Text a component renders as `{children}` is written between its tags where it's used.
    if (field === 'text' && (attrName === null || attrName === 'children')) {
        const text = textOf(element);
        if (text === 'text') {
            const raw = element['children'].map((k) => String(k['value'] ?? '')).join('');
            return { kind: 'literal', value: raw.replace(/\s+/g, ' ').trim(), at: where(at.file, element) };
        }
        if (text === 'empty')
            return { kind: 'literal', value: '', at: where(at.file, element) };
        if (text === 'mixed')
            return { kind: 'data', reason: 'it mixes text with other elements or values' };
        return resolveExpression(text, [...ancestors, element], program, at.file);
    }
    const attr = attributeOf(element, attrName ?? field);
    // No attribute yet: one can be added where the element is written.
    if (attr === 'missing')
        return { kind: 'literal', value: '', at: where(at.file, element) };
    if (attr === 'spread')
        return { kind: 'data', reason: 'it may come from props spread onto the element' };
    return resolveExpression(attr, [...ancestors, element], program, at.file);
};
/** Where the content of `field` on the element comes from, following props to where components are used. */
export const classifyContent = async (query) => {
    let result = await contentAt(query, query.source, query.field, null);
    let via = null;
    for (let hop = 0; hop < MAX_HOPS && result.kind === 'prop'; hop += 1) {
        const { prop, component } = result;
        via ??= { prop, component };
        const call = query.calls.find((c) => c.name === component)?.call ?? null;
        if (call === null)
            return { kind: 'unknown', reason: `Scamp can’t see where ${component} is used, to tell where its ${prop} comes from` };
        result = await contentAt(query, call, query.field, prop);
    }
    if (result.kind === 'prop')
        return { kind: 'unknown', reason: 'it’s passed through too many components to follow' };
    if (result.kind === 'data')
        return { kind: 'data', reason: result.reason };
    if (via !== null)
        return { kind: 'prop', value: result.value, at: result.at, prop: via.prop, component: via.component };
    return result.kind === 'import' ? { kind: 'import', value: result.value, at: result.at } : { kind: 'literal', value: result.value, at: result.at };
};
/**
 * A file name not already in `taken`, compared without case (macOS folders
 * ignore it): `logo.png`, then `logo-2.png`, and so on. Spaces become dashes,
 * so the name works as a URL.
 */
export const freeFileName = (name, taken) => {
    const clean = name.trim().replace(/\s+/g, '-') || 'image';
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    const used = new Set(taken.map((t) => t.toLowerCase()));
    let candidate = clean;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1)
        candidate = `${stem}-${n}${ext}`;
    return candidate;
};
/**
 * The lines of the JSX element written at `source` (`file:line:col`), up to
 * `max` of them; ten lines from `line` when the parse can't find it.
 */
export const jsxLines = (code, source, max = 40) => {
    const at = splitSource(source);
    if (at === null)
        return null;
    const all = code.split('\n');
    if (at.line < 1 || at.line > all.length)
        return null;
    const program = parseFile(code, at.file);
    const found = program === null ? null : elementAt(program, at.line, at.column);
    const end = found?.element.loc?.end?.line ?? at.line + 9;
    return { start: at.line, lines: all.slice(at.line - 1, Math.min(end, at.line + max - 1)) };
};
/**
 * The CSS Module class the element at `source` is written with, when its
 * `className` is exactly `{styles.name}` and `styles` is imported from a
 * `*.module.css` file: that file, relative to the project, and the class.
 */
export const moduleClassAt = (code, source) => {
    const at = splitSource(source);
    if (at === null)
        return null;
    const program = parseFile(code, at.file);
    const found = program === null ? null : elementAt(program, at.line, at.column);
    if (program === null || found === null)
        return null;
    const opening = found.element['openingElement'];
    const attr = opening['attributes'].find((a) => a.type === 'JSXAttribute' && a['name']['name'] === 'className');
    const value = attr?.['value'];
    const expr = value?.type === 'JSXExpressionContainer' ? value['expression'] : undefined;
    if (expr?.type !== 'MemberExpression')
        return null;
    const object = expr['object'];
    const property = expr['property'];
    const className = expr['computed'] === true ? literalString(property) : property.type === 'Identifier' ? String(property['name']) : null;
    if (object.type !== 'Identifier' || className === null)
        return null;
    for (const st of program['body']) {
        if (st.type !== 'ImportDeclaration')
            continue;
        const from = String(st['source']['value']);
        const binds = st['specifiers'].some((s) => s.type === 'ImportDefaultSpecifier' && s['local']['name'] === object['name']);
        if (!binds || !/\.module\.css$/.test(from) || !from.startsWith('.'))
            continue;
        const dir = at.file.includes('/') ? at.file.slice(0, at.file.lastIndexOf('/')) : '';
        const parts = [...(dir === '' ? [] : dir.split('/')), ...from.split('/')];
        const out = [];
        for (const p of parts) {
            if (p === '..') {
                if (out.length === 0)
                    return null;
                out.pop();
            }
            else if (p !== '.')
                out.push(p);
        }
        return { file: out.join('/'), className };
    }
    return null;
};
// The JSX helpers, for the list check in listOrigin.ts.
export { elementAt, parseFile, splitSource };
