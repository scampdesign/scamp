import { describe, it, expect } from 'vitest';
import { detectReactProject } from '../src/main/reactImport/detect';
/**
 * Reading a React project folder: framework, router, how to run it.
 * see docs/plans/react-import-plan.md
 */
const project = (pkg, files = ['package.json', 'node_modules', 'package-lock.json']) => {
    const result = detectReactProject(pkg, files);
    if (!result.ok)
        throw new Error(result.reason);
    return result.project;
};
const vite = {
    name: 'riq_frontend',
    scripts: { dev: 'vite', build: 'tsc -b && vite build' },
    dependencies: { react: '^19.3.0', 'react-router-dom': '^7.18.4' },
    devDependencies: { vite: '^8.3.0' },
};
describe('detectReactProject', () => {
    it('reads a Vite app with React Router', () => {
        const p = project(vite);
        expect(p).toMatchObject({
            name: 'riq_frontend',
            framework: 'vite',
            router: 'react-router',
            devScript: 'dev',
            packageManager: 'npm',
            needsInstall: false,
        });
    });
    it('runs Vite on the port it is given, and no other', () => {
        expect(project(vite).devCommand(5199)).toEqual({
            command: 'npm',
            args: ['run', 'dev', '--', '--port', '5199', '--strictPort'],
            env: {},
        });
    });
    it('passes the port without `--` for pnpm and yarn', () => {
        const p = project(vite, ['package.json', 'pnpm-lock.yaml', 'node_modules']);
        expect(p.packageManager).toBe('pnpm');
        expect(p.devCommand(5199).args).toEqual(['run', 'dev', '--port', '5199', '--strictPort']);
    });
    it('reads Next.js, and which router it uses from the folders', () => {
        const next = { scripts: { dev: 'next dev' }, dependencies: { react: '19', next: '15' } };
        expect(project(next, ['package.json', 'app']).router).toBe('next-app');
        expect(project(next, ['package.json', 'src/pages']).router).toBe('next-pages');
        expect(project(next, ['package.json']).devCommand(4000).args).toEqual(['run', 'dev', '--', '-p', '4000']);
    });
    it('gives Create React App its port through the environment', () => {
        const cra = { scripts: { start: 'react-scripts start' }, dependencies: { react: '18', 'react-scripts': '5' } };
        const p = project(cra);
        expect(p.devScript).toBe('start');
        expect(p.devCommand(3100)).toEqual({ command: 'npm', args: ['run', 'start'], env: { PORT: '3100', BROWSER: 'none' } });
    });
    it('says when dependencies need installing', () => {
        expect(project(vite, ['package.json']).needsInstall).toBe(true);
    });
    it('says there is no router when there is none', () => {
        expect(project({ ...vite, dependencies: { react: '19' } }).router).toBe('none');
    });
    it('finds the dev script by its command, not its name', () => {
        expect(project({ ...vite, scripts: { serve: 'vite serve', dev: 'node tools/dev.js' } }).devScript).toBe('serve');
    });
    it('refuses a folder that is not a React project', () => {
        expect(detectReactProject({ dependencies: { vue: '3' } }, [])).toEqual({
            ok: false,
            reason: 'This folder’s package.json doesn’t depend on React.',
        });
        expect(detectReactProject(null, [])).toMatchObject({ ok: false });
        expect(detectReactProject('{', [])).toMatchObject({ ok: false });
    });
    it('refuses React Native, and frameworks it cannot run', () => {
        expect(detectReactProject({ dependencies: { react: '19', 'react-native': '0.80' } }, [])).toMatchObject({ ok: false });
        expect(detectReactProject({ dependencies: { react: '19', gatsby: '5' } }, [])).toMatchObject({ ok: false });
    });
    it('refuses a project with no script that starts the dev server', () => {
        expect(detectReactProject({ ...vite, scripts: { build: 'vite build' } }, [])).toMatchObject({ ok: false });
    });
});
