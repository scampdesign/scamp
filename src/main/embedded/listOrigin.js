import { elementAt, parseFile, splitSource } from './content';
const ITERATORS = new Set(['map', 'flatMap']);
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
const unwrap = (node) => node !== undefined && /^TS(As|Satisfies|NonNull)Expression$|^ParenthesizedExpression$/.test(node.type) ? unwrap(node['expression']) : node;
const lineOf = (file, node) => `${file}:${node.loc?.start.line ?? 0}`;
/** Whether a binding pattern (a parameter, a destructuring) declares `name`. */
const binds = (pattern, name) => {
    if (pattern === null || pattern === undefined)
        return false;
    if (pattern.type === 'Identifier')
        return pattern['name'] === name;
    if (pattern.type === 'AssignmentPattern')
        return binds(pattern['left'], name);
    if (pattern.type === 'RestElement')
        return binds(pattern['argument'], name);
    if (pattern.type === 'ArrayPattern')
        return pattern['elements'].some((e) => binds(e, name));
    if (pattern.type === 'ObjectPattern')
        return pattern['properties'].some((p) => binds((p['value'] ?? p['argument']), name));
    return false;
};
/** How `name` is declared in `body` (statements): as an array literal (`array`, its declarator), or from something else (`other`, the value). */
const declared = (body, name) => {
    for (const st of body) {
        const decl = st.type === 'ExportNamedDeclaration' ? st['declaration'] : st;
        if (decl?.type !== 'VariableDeclaration')
            continue;
        for (const d of decl['declarations']) {
            if (!binds(d['id'], name))
                continue;
            const init = unwrap(d['init']);
            if (d['id'].type === 'Identifier' && init?.type === 'ArrayExpression')
                return { kind: 'array', decl: d };
            return init === undefined ? null : { kind: 'other', init };
        }
    }
    return null;
};
const snippet = (code, node) => {
    const text = code.slice(node.start ?? 0, node.end ?? 0).replace(/\s+/g, ' ');
    return text.length > 40 ? `${text.slice(0, 37)}…` : text;
};
/** A module path from `file`, relative or through an alias, as a project file that exists. */
const resolveModule = async (file, spec, query) => {
    let base = null;
    if (spec.startsWith('.')) {
        const parts = [...file.split('/').slice(0, -1), ...spec.split('/')];
        const out = [];
        for (const p of parts) {
            if (p === '..')
                out.pop();
            else if (p !== '.')
                out.push(p);
        }
        base = out.join('/');
    }
    else {
        const alias = query.aliases.find((a) => spec.startsWith(a.prefix));
        if (alias !== undefined)
            base = `${alias.target}${spec.slice(alias.prefix.length)}`.replace(/^\.\//, '');
    }
    if (base === null)
        return null;
    for (const ext of EXTENSIONS) {
        const code = await query.read(base + ext);
        if (code !== null)
            return { file: base + ext, code };
    }
    return null;
};
/** Where the array `name` comes from, seen from `file`'s `program` and the functions around the list. */
const arrayOrigin = async (name, file, code, program, scopes, query) => {
    // The nearest function first: a callback's own parameter, then the component's.
    for (const fn of [...scopes].reverse()) {
        if ((fn['params'] ?? []).some((p) => binds(p, name))) {
            return { kind: 'data', reason: `the list \`${name}\` is passed in as a prop`, at: null };
        }
        const body = fn['body'];
        const found = body?.type === 'BlockStatement' ? declared(body['body'], name) : null;
        if (found?.kind === 'array')
            return { kind: 'written', at: lineOf(file, found.decl), name };
        if (found?.kind === 'other')
            return dataFrom(name, found.init, code);
    }
    const top = declared(program['body'], name);
    if (top?.kind === 'array')
        return { kind: 'written', at: lineOf(file, top.decl), name };
    if (top?.kind === 'other')
        return dataFrom(name, top.init, code);
    for (const st of program['body']) {
        if (st.type !== 'ImportDeclaration')
            continue;
        const spec = st['specifiers'].find((s) => s['local']['name'] === name);
        if (spec === undefined)
            continue;
        const imported = spec.type === 'ImportSpecifier' ? String(spec['imported']['name'] ?? name) : name;
        const from = String(st['source']['value']);
        const target = await resolveModule(file, from, query);
        if (target === null)
            return { kind: 'data', reason: `the list \`${name}\` comes from \`${from}\`, outside your code`, at: null };
        const theirs = parseFile(target.code, target.file);
        const there = theirs === null ? null : declared(theirs['body'], imported);
        if (there?.kind === 'array')
            return { kind: 'written', at: lineOf(target.file, there.decl), name: imported };
        return { kind: 'data', reason: `the list \`${name}\` isn’t written as a list in ${target.file}`, at: null };
    }
    return { kind: 'data', reason: `Scamp can’t find where the list \`${name}\` comes from`, at: null };
};
const dataFrom = (name, init, code) => {
    if (init.type === 'CallExpression') {
        const callee = init['callee'];
        const fn = callee.type === 'Identifier' ? String(callee['name']) : snippet(code, callee);
        if (/^use(State|Reducer)$/.test(fn))
            return { kind: 'data', reason: `the list \`${name}\` is kept in state while the app runs`, at: null };
        return { kind: 'data', reason: `the list \`${name}\` comes from \`${fn}()\`, worked out while the app runs`, at: null };
    }
    return { kind: 'data', reason: `the list \`${name}\` comes from \`${snippet(code, init)}\`, worked out while the app runs`, at: null };
};
/** The `.map()` drawing the element at `source`, and where its list comes from; null when it isn't in one. */
const listAt = async (source, query) => {
    const at = splitSource(source);
    if (at === null)
        return null;
    const code = await query.read(at.file);
    const program = code === null ? null : parseFile(code, at.file);
    const found = program === null ? null : elementAt(program, at.line, at.column);
    if (code === null || program === null || found === null)
        return null;
    const chain = found.ancestors;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
        const call = chain[i];
        if (call?.type !== 'CallExpression')
            continue;
        const callee = call['callee'];
        if (callee.type !== 'MemberExpression' || !ITERATORS.has(String(callee['property']['name'])))
            continue;
        const list = unwrap(callee['object']);
        if (list === undefined)
            return null;
        if (list.type === 'ArrayExpression')
            return { kind: 'written', at: lineOf(at.file, list), name: 'the list' };
        if (list.type !== 'Identifier')
            return { kind: 'data', reason: `the list comes from \`${snippet(code, list)}\`, worked out while the app runs`, at: null };
        const scopes = chain.slice(0, i).filter((n) => /Function/.test(n.type));
        return arrayOrigin(String(list['name']), at.file, code, program, scopes, query);
    }
    return null;
};
/** Where the order of the list an element is drawn by comes from: its own JSX first, then where its component is used. */
export const listOrigin = async (query) => {
    for (const source of query.sources) {
        const found = await listAt(source, query);
        if (found !== null)
            return found;
    }
    return null;
};
/** `paths` from a tsconfig or jsconfig, as prefixes: `"@/*": ["./src/*"]` → `@/` → `src/`. */
export const aliasesFrom = (config) => {
    try {
        const parsed = JSON.parse(config.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
        const base = (parsed.compilerOptions?.baseUrl ?? '.').replace(/^\.\/?/, '').replace(/\/?$/, '/').replace(/^\/$/, '');
        return Object.entries(parsed.compilerOptions?.paths ?? {})
            .filter(([key, to]) => key.endsWith('/*') && to[0]?.endsWith('/*') === true)
            .map(([key, to]) => ({ prefix: key.slice(0, -1), target: `${base}${(to[0] ?? '').slice(0, -1).replace(/^\.\//, '')}` }));
    }
    catch {
        return [];
    }
};
