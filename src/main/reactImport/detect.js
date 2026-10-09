/**
 * What kind of React project a folder is, and how to run it.
 *
 * Pure: the caller reads `package.json` and lists the folder. Everything
 * the React import does next — start the dev server, find the routes —
 * depends on these answers, so a project this can't read is said to be
 * unsupported up front rather than failing somewhere later.
 * see docs/plans/react-import-plan.md
 */
const asRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const LOCKFILES = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
];
/** The script whose command runs the framework's dev server. */
const DEV_SCRIPT_PATTERNS = {
    vite: /(^|\s|\/)vite(\s+(dev|serve))?(\s|$)/,
    next: /(^|\s|\/)next\s+dev(\s|$)/,
    cra: /(^|\s|\/)react-scripts\s+start(\s|$)/,
};
const frameworkOf = (deps) => {
    if ('next' in deps)
        return 'next';
    if ('vite' in deps)
        return 'vite';
    if ('react-scripts' in deps)
        return 'cra';
    return null;
};
const routerOf = (framework, deps, files) => {
    if (framework === 'next') {
        if (files.has('app') || files.has('src/app'))
            return 'next-app';
        if (files.has('pages') || files.has('src/pages'))
            return 'next-pages';
        return 'none';
    }
    return 'react-router' in deps || 'react-router-dom' in deps ? 'react-router' : 'none';
};
/**
 * `files` are paths relative to the project root: its top-level entries,
 * plus `src/app` and `src/pages` when they exist.
 */
export const detectReactProject = (packageJson, files) => {
    const pkg = asRecord(packageJson);
    const deps = { ...asRecord(pkg.devDependencies), ...asRecord(pkg.dependencies) };
    if (!('react' in deps))
        return { ok: false, reason: 'This folder’s package.json doesn’t depend on React.' };
    if ('react-native' in deps)
        return { ok: false, reason: 'React Native apps can’t be imported yet.' };
    const framework = frameworkOf(deps);
    if (framework === null) {
        return { ok: false, reason: 'Scamp can import Vite, Next.js, and Create React App projects, and this is none of them.' };
    }
    const scripts = asRecord(pkg.scripts);
    const devScript = ['dev', 'start', 'serve'].find((name) => typeof scripts[name] === 'string' && DEV_SCRIPT_PATTERNS[framework].test(scripts[name]));
    if (devScript === undefined) {
        return { ok: false, reason: 'Scamp couldn’t find the script that starts this app’s dev server.' };
    }
    const present = new Set(files);
    const packageManager = LOCKFILES.find(([file]) => present.has(file))?.[1] ?? 'npm';
    return {
        ok: true,
        project: {
            name: typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : 'react-app',
            framework,
            packageManager,
            router: routerOf(framework, deps, present),
            devScript,
            devCommand: (port) => {
                // Each framework takes its port its own way; CRA only from the env.
                const portArgs = framework === 'vite' ? ['--port', String(port), '--strictPort'] : framework === 'next' ? ['-p', String(port)] : [];
                const env = framework === 'cra' ? { PORT: String(port), BROWSER: 'none' } : {};
                // `npm run dev -- --port`: npm needs the `--`; the others pass extra args through.
                const args = packageManager === 'npm' ? ['run', devScript, '--', ...portArgs] : ['run', devScript, ...portArgs];
                return { command: packageManager, args: portArgs.length === 0 ? args.filter((a) => a !== '--') : args, env };
            },
            needsInstall: !present.has('node_modules'),
        },
    };
};
