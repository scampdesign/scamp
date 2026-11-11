import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readProjectComponents, scaffoldNextjsProject, } from '../../src/main/ipc/projectScaffold';
import { componentPathsFor, createComponent, deleteComponent, readComponent, } from '../../src/main/ipc/componentOps';
describe('readProjectComponents', () => {
    let projectDir;
    beforeEach(async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-components-'));
        projectDir = path.join(tmp, 'my-project');
        await fs.mkdir(projectDir);
        await scaffoldNextjsProject(projectDir, 'my-project');
    });
    afterEach(async () => {
        await fs.rm(path.dirname(projectDir), { recursive: true, force: true });
    });
    it('returns an empty list when components/ does not exist yet', async () => {
        const components = await readProjectComponents(projectDir);
        expect(components).toEqual([]);
    });
    it('picks up a single component pair', async () => {
        const componentsDir = path.join(projectDir, 'components', 'Button');
        await fs.mkdir(componentsDir, { recursive: true });
        await fs.writeFile(path.join(componentsDir, 'Button.tsx'), `import styles from './Button.module.css';\nexport default function Button() { return <div data-scamp-id="root" className={styles.root} />; }\n`, 'utf-8');
        await fs.writeFile(path.join(componentsDir, 'Button.module.css'), `.root {}\n`, 'utf-8');
        const components = await readProjectComponents(projectDir);
        expect(components.map((c) => c.name)).toEqual(['Button']);
        expect(components[0].tsxContent).toContain('export default function Button()');
    });
    it('skips folders that are missing either the TSX or CSS half', async () => {
        const halfDir = path.join(projectDir, 'components', 'Broken');
        await fs.mkdir(halfDir, { recursive: true });
        await fs.writeFile(path.join(halfDir, 'Broken.tsx'), `export default function Broken() { return null; }\n`, 'utf-8');
        // Intentionally no Broken.module.css — readProjectComponents
        // should refuse to surface the half-built component.
        const components = await readProjectComponents(projectDir);
        expect(components).toEqual([]);
    });
});
describe('componentOps — create / read / delete', () => {
    let projectDir;
    beforeEach(async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-componentops-'));
        projectDir = path.join(tmp, 'my-project');
        await fs.mkdir(projectDir);
        await scaffoldNextjsProject(projectDir, 'my-project');
    });
    afterEach(async () => {
        await fs.rm(path.dirname(projectDir), { recursive: true, force: true });
    });
    it('creates the folder + TSX + CSS pair under components/<Name>/', async () => {
        const file = await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        const paths = componentPathsFor(projectDir, 'Button');
        expect(file.tsxPath).toBe(paths.tsxPath);
        expect(file.cssPath).toBe(paths.cssPath);
        const tsx = await fs.readFile(paths.tsxPath, 'utf-8');
        const css = await fs.readFile(paths.cssPath, 'utf-8');
        expect(tsx).toContain('export default function Button({ className }: ButtonProps)');
        expect(tsx).toContain(`import styles from './Button.module.css';`);
        expect(css).toContain('.root');
    });
    it('refuses to create a duplicate component', async () => {
        await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        await expect(createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs')).rejects.toThrow(/already exists/);
    });
    it('rejects non-PascalCase names', async () => {
        await expect(createComponent({ projectPath: projectDir, componentName: 'button' }, 'nextjs')).rejects.toThrow(/Invalid component name/);
        await expect(createComponent({ projectPath: projectDir, componentName: 'hero-card' }, 'nextjs')).rejects.toThrow(/Invalid component name/);
        await expect(createComponent({ projectPath: projectDir, componentName: 'snake_case' }, 'nextjs')).rejects.toThrow(/Invalid component name/);
    });
    it('refuses to create components in legacy-format projects', async () => {
        await expect(createComponent({ projectPath: projectDir, componentName: 'Button' }, 'legacy')).rejects.toThrow(/only supported in Next\.js/);
    });
    it('readComponent returns the saved files', async () => {
        await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        const read = await readComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        expect(read).not.toBeNull();
        expect(read.name).toBe('Button');
        expect(read.tsxContent).toContain('export default function Button({ className }: ButtonProps)');
    });
    it('readComponent returns null for a missing component', async () => {
        const read = await readComponent({ projectPath: projectDir, componentName: 'NotThere' }, 'nextjs');
        expect(read).toBeNull();
    });
    it('deleteComponent removes the folder and is idempotent', async () => {
        await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        const { componentDir } = componentPathsFor(projectDir, 'Button');
        expect(await fs
            .access(componentDir)
            .then(() => true)
            .catch(() => false)).toBe(true);
        await deleteComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        expect(await fs
            .access(componentDir)
            .then(() => true)
            .catch(() => false)).toBe(false);
        // Calling delete again is a no-op rather than an error — the
        // user's intent ("be gone") is already satisfied.
        await expect(deleteComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs')).resolves.toBeUndefined();
    });
    it('deleteComponent keeps other files in the folder, such as a test an agent added', async () => {
        await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        const { componentDir, tsxPath, cssPath } = componentPathsFor(projectDir, 'Button');
        const extra = path.join(componentDir, 'Button.test.tsx');
        await fs.writeFile(extra, 'test', 'utf-8');
        await deleteComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        expect(await fs.readFile(extra, 'utf-8')).toBe('test');
        await expect(fs.access(tsxPath)).rejects.toThrow();
        await expect(fs.access(cssPath)).rejects.toThrow();
    });
    it('createComponent works again in a folder left holding other files', async () => {
        await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        const { componentDir } = componentPathsFor(projectDir, 'Button');
        await fs.writeFile(path.join(componentDir, 'Button.stories.tsx'), 'stories', 'utf-8');
        await deleteComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        const again = await createComponent({ projectPath: projectDir, componentName: 'Button' }, 'nextjs');
        expect(again.name).toBe('Button');
    });
});
