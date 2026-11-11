import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  migrateLegacyToNextjs,
  migrateNextjsToScamp,
  rewriteAssetReferences,
  rewritePackageJsonForScamp,
} from '../../src/main/ipc/projectMigrate';
import { DEFAULT_COMPONENT_CSS, defaultComponentTsx } from '../../src/main/ipc/componentScaffold';
import { viewWrapperTsx } from '../../src/shared/templates';
import { detectProjectFormat } from '../../src/main/ipc/projectFormat';
import {
  readProjectNextjs,
  scaffoldLegacyProject,
  scaffoldNextjsProject,
} from '../../src/main/ipc/projectScaffold';

describe('rewriteAssetReferences', () => {
  it('rewrites url("./assets/foo.png") to url("/assets/foo.png")', () => {
    const css = `.hero { background: url("./assets/hero.png"); }`;
    expect(rewriteAssetReferences(css)).toBe(
      `.hero { background: url("/assets/hero.png"); }`
    );
  });

  it("rewrites single-quoted url('./assets/...') variants", () => {
    expect(rewriteAssetReferences(`url('./assets/x.svg')`)).toBe(
      `url('/assets/x.svg')`
    );
  });

  it('rewrites unquoted url(./assets/...) variants', () => {
    expect(rewriteAssetReferences(`url(./assets/x.svg)`)).toBe(
      `url(/assets/x.svg)`
    );
  });

  it('rewrites JSX src="./assets/..." attributes', () => {
    const tsx = `<img src="./assets/hero.png" alt="" />`;
    expect(rewriteAssetReferences(tsx)).toBe(
      `<img src="/assets/hero.png" alt="" />`
    );
  });

  it('leaves unrelated strings alone', () => {
    // The migrator must not touch a string literal that happens to
    // contain `./assets/`.
    const tsx = `const message = "open ./assets/ in your editor";`;
    expect(rewriteAssetReferences(tsx)).toBe(tsx);
  });

  it('leaves agent-written /assets/ references untouched (idempotent)', () => {
    const css = `background: url("/assets/hero.png");`;
    expect(rewriteAssetReferences(css)).toBe(css);
  });
});

describe('migrateLegacyToNextjs', () => {
  let projectDir: string;
  let parentDir: string;

  beforeEach(async () => {
    parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-migrate-'));
    projectDir = path.join(parentDir, 'my-project');
    await fs.mkdir(projectDir);
    await scaffoldLegacyProject(projectDir);
  });

  afterEach(async () => {
    await fs.rm(parentDir, { recursive: true, force: true });
  });

  it('migrates a single-page legacy project to nextjs format', async () => {
    const result = await migrateLegacyToNextjs(projectDir);

    expect(await detectProjectFormat(projectDir)).toBe('nextjs');
    expect(result.unmovedFiles).toEqual([]);

    // app/page.tsx exists with the new import line
    const tsx = await fs.readFile(
      path.join(projectDir, 'app', 'page.tsx'),
      'utf-8'
    );
    expect(tsx).toContain(`import styles from './page.module.css';`);
    expect(tsx).not.toContain(`./home.module.css`);

    // app/layout.tsx imports theme.css
    const layout = await fs.readFile(
      path.join(projectDir, 'app', 'layout.tsx'),
      'utf-8'
    );
    expect(layout).toContain(`import './theme.css';`);

    // theme.css moved into app/
    const themeAtRoot = await fs
      .access(path.join(projectDir, 'theme.css'))
      .then(() => true)
      .catch(() => false);
    expect(themeAtRoot).toBe(false);
    const themeInApp = await fs.readFile(
      path.join(projectDir, 'app', 'theme.css'),
      'utf-8'
    );
    expect(themeInApp).toContain('--color-primary');

    // package.json + next.config.ts at the root
    const pkg = JSON.parse(
      await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8')
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.next).toBeDefined();
    expect(
      await fs.access(path.join(projectDir, 'next.config.ts'))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });

  it('keeps the original files in a backup directory', async () => {
    const result = await migrateLegacyToNextjs(projectDir);
    expect(result.backupPath).toMatch(/\.scamp-backup-/);
    const backupContents = (await fs.readdir(result.backupPath)).sort();
    // home.tsx + home.module.css + theme.css + agent.md
    expect(backupContents).toContain('home.tsx');
    expect(backupContents).toContain('home.module.css');
    expect(backupContents).toContain('theme.css');
    expect(backupContents).toContain('agent.md');
  });

  it('migrates multi-page projects, preserving each page', async () => {
    // Add a second page in the legacy layout.
    await fs.writeFile(
      path.join(projectDir, 'about.tsx'),
      `import styles from './about.module.css';\nexport default function About() { return <div data-scamp-id="root" className={styles.root} />; }\n`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(projectDir, 'about.module.css'),
      `.root { background: red; }\n`,
      'utf-8'
    );

    await migrateLegacyToNextjs(projectDir);

    const pages = await readProjectNextjs(projectDir);
    expect(pages.map((p) => p.name).sort()).toEqual(['about', 'home']);

    const aboutTsx = await fs.readFile(
      path.join(projectDir, 'app', 'about', 'page.tsx'),
      'utf-8'
    );
    expect(aboutTsx).toContain(`import styles from './page.module.css';`);
    expect(aboutTsx).not.toContain(`./about.module.css`);
  });

  it('moves assets/ into public/assets/ and rewrites references', async () => {
    // Set up a legacy asset and a CSS reference to it.
    await fs.mkdir(path.join(projectDir, 'assets'));
    await fs.writeFile(
      path.join(projectDir, 'assets', 'hero.png'),
      'PNG-bytes',
      'utf-8'
    );
    await fs.writeFile(
      path.join(projectDir, 'home.module.css'),
      `.root {\n  background: url('./assets/hero.png');\n}\n`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(projectDir, 'home.tsx'),
      `import styles from './home.module.css';\nexport default function Home() { return <img src="./assets/hero.png" alt="" />; }\n`,
      'utf-8'
    );

    await migrateLegacyToNextjs(projectDir);

    // Asset moved
    const heroAtPublic = await fs.readFile(
      path.join(projectDir, 'public', 'assets', 'hero.png'),
      'utf-8'
    );
    expect(heroAtPublic).toBe('PNG-bytes');
    const heroAtLegacy = await fs
      .access(path.join(projectDir, 'assets'))
      .then(() => true)
      .catch(() => false);
    expect(heroAtLegacy).toBe(false);

    // CSS reference rewritten
    const css = await fs.readFile(
      path.join(projectDir, 'app', 'page.module.css'),
      'utf-8'
    );
    expect(css).toContain(`url('/assets/hero.png')`);
    expect(css).not.toContain(`./assets/`);

    // TSX reference rewritten
    const tsx = await fs.readFile(
      path.join(projectDir, 'app', 'page.tsx'),
      'utf-8'
    );
    expect(tsx).toContain(`src="/assets/hero.png"`);
    expect(tsx).not.toContain(`src="./assets/`);
  });

  it('leaves unrecognised root-level files in place and reports them', async () => {
    await fs.writeFile(
      path.join(projectDir, 'README.md'),
      '# Notes\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(projectDir, 'scratch.txt'),
      'wip',
      'utf-8'
    );

    const result = await migrateLegacyToNextjs(projectDir);
    expect(result.unmovedFiles.sort()).toEqual(['README.md', 'scratch.txt']);

    // Files still at the project root.
    const readme = await fs.readFile(
      path.join(projectDir, 'README.md'),
      'utf-8'
    );
    expect(readme).toBe('# Notes\n');
  });

  it('refuses, before moving anything, when the user has a file the migration would replace', async () => {
    await fs.writeFile(path.join(projectDir, 'package.json'), '{"name":"mine"}', 'utf-8');
    await fs.mkdir(path.join(projectDir, 'app'));
    await fs.writeFile(path.join(projectDir, 'app', 'notes.txt'), 'mine', 'utf-8');
    await expect(migrateLegacyToNextjs(projectDir)).rejects.toThrow(/Move or rename .*package\.json/);
    expect(await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8')).toBe('{"name":"mine"}');
    expect(await fs.readFile(path.join(projectDir, 'app', 'notes.txt'), 'utf-8')).toBe('mine');
    const left = await fs.readdir(projectDir);
    expect(left).toContain('home.tsx');
    expect(left.filter((e) => e.startsWith('.scamp-stage-') || e.startsWith('.scamp-backup-'))).toEqual([]);
  });

  it('moves scamp.config.json into the backup (it is recreated by openProject)', async () => {
    await fs.writeFile(
      path.join(projectDir, 'scamp.config.json'),
      '{}',
      'utf-8'
    );
    const result = await migrateLegacyToNextjs(projectDir);
    expect(await fs.readdir(result.backupPath)).toContain('scamp.config.json');
  });

  it('rejects when the project has no pages', async () => {
    // Wipe the legacy scaffold's pages.
    await fs.rm(path.join(projectDir, 'home.tsx'));
    await fs.rm(path.join(projectDir, 'home.module.css'));
    await expect(migrateLegacyToNextjs(projectDir)).rejects.toThrow(
      /No pages found/
    );
  });
});

describe('rewritePackageJsonForScamp', () => {
  it('swaps Next and React for scampjs and Preact and keeps everything else', () => {
    const original = JSON.stringify({
      name: 'noise',
      version: '0.1.0',
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'eslint .' },
      dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0', zod: '^3.0.0' },
      devDependencies: { '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', typescript: '^5.5.0' },
    });
    const out = JSON.parse(rewritePackageJsonForScamp(original, 'noise', '^0.2.1')) as Record<string, unknown>;
    expect(out['scripts']).toEqual({ dev: 'scamp dev', build: 'scamp build', preview: 'scamp preview', lint: 'eslint .' });
    expect(out['dependencies']).toEqual({ preact: '^10.29.0', scampjs: '^0.2.1', zod: '^3.0.0' });
    expect(out['devDependencies']).toEqual({ typescript: '^5.5.0' });
    expect(out['type']).toBe('module');
    expect(out['version']).toBe('0.1.0');
  });

  it('replaces a malformed package.json outright', () => {
    const out = JSON.parse(rewritePackageJsonForScamp('not json', 'noise', '^0.2.1')) as Record<string, unknown>;
    expect(out['name']).toBe('noise');
    expect(out['dependencies']).toEqual({ preact: '^10.29.0', scampjs: '^0.2.1' });
    expect(out['devDependencies']).toBeUndefined();
  });
});

describe('migrateNextjsToScamp', () => {
  let projectDir: string;

  beforeEach(async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-migrate-'));
    projectDir = path.join(parent, 'noise');
    await fs.mkdir(projectDir);
    await scaffoldNextjsProject(projectDir, 'noise');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(projectDir), { recursive: true, force: true });
  });

  const write = async (relative: string, content: string): Promise<void> => {
    const file = path.join(projectDir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf-8');
  };
  const read = (relative: string): Promise<string> => fs.readFile(path.join(projectDir, relative), 'utf-8');
  const exists = (relative: string): Promise<boolean> =>
    fs.access(path.join(projectDir, relative)).then(() => true, () => false);

  /** A project whose pages are already views: what the renderer hands over. */
  const makeViews = async (): Promise<void> => {
    await write('app/page.tsx', viewWrapperTsx('Home'));
    await write('app/about/page.tsx', viewWrapperTsx('About'));
    await write('app/about/page.module.css', '.root {\n}\n');
    for (const name of ['Home', 'About']) {
      await write(`views/${name}/${name}.tsx`, defaultComponentTsx(name));
      await write(`views/${name}/${name}.module.css`, DEFAULT_COMPONENT_CSS);
    }
    await write('DESIGN.md', '# Noise\n');
    await write('app/api/ping/route.ts', 'export const GET = () => new Response("pong");\n');
    await write('features/HomeScreen.tsx', 'export default function HomeScreen() { return null; }\n');
  };

  it('refuses, before moving anything, when a routes/ folder is already there', async () => {
    await makeViews();
    await write('routes/mine.ts', 'mine');
    await expect(migrateNextjsToScamp(projectDir, '^0.2.1')).rejects.toThrow(/Move or rename routes/);
    expect(await read('routes/mine.ts')).toBe('mine');
    expect(await exists('app/page.tsx')).toBe(true);
    expect((await fs.readdir(projectDir)).filter((e) => e.startsWith('.scamp-'))).toEqual([]);
  });

  it('refuses while a plain page remains, naming it', async () => {
    await expect(migrateNextjsToScamp(projectDir, '^0.2.1')).rejects.toThrow('Convert these pages to views first: home');
    expect(await exists('app/page.tsx')).toBe(true);
    expect(await exists('routes')).toBe(false);
  });

  it('writes routes, design/, the framework package.json, and keeps views and components', async () => {
    await makeViews();
    const result = await migrateNextjsToScamp(projectDir, '^0.2.1');

    expect(await read('routes/index.tsx')).toBe(
      "import Home from '@/views/Home/Home';\n\nexport const render = 'static';\n\nexport default function HomeRoute() {\n  return <Home />;\n}\n"
    );
    expect(await read('routes/about.tsx')).toContain("import About from '@/views/About/About';");
    expect(await read('views/Home/Home.tsx')).toBe(defaultComponentTsx('Home'));
    expect(await read('design/theme.css')).toContain('--color-primary');
    expect(await read('design/theme.css')).toMatch(/body\s*\{[^}]*margin:\s*0/);
    expect(await read('design/DESIGN.md')).toBe('# Noise\n');
    const pkg = JSON.parse(await read('package.json')) as { dependencies: Record<string, string>; scripts: Record<string, string> };
    expect(pkg.dependencies).toEqual({ preact: '^10.29.0', scampjs: '^0.2.1' });
    expect(pkg.scripts['dev']).toBe('scamp dev');
    expect(await exists('scamp-env.d.ts')).toBe(true);
    expect(JSON.parse(await read('tsconfig.json'))).toHaveProperty('compilerOptions.jsxImportSource', 'preact');

    // Next.js files are in the backup at their paths; the leftovers are listed.
    expect(await exists('app/page.tsx')).toBe(false);
    expect(await exists('app/layout.tsx')).toBe(false);
    expect(await exists('next.config.ts')).toBe(false);
    expect(await exists('DESIGN.md')).toBe(false);
    expect(await exists(path.relative(projectDir, path.join(result.backupPath, 'app', 'layout.tsx')))).toBe(true);
    expect(await exists(path.relative(projectDir, path.join(result.backupPath, 'app', 'about', 'page.tsx')))).toBe(true);
    expect(await exists('app/api/ping/route.ts')).toBe(true);
    expect(await exists('app/about')).toBe(false);
    expect(result.unmovedFiles).toEqual(['app/api/ping/route.ts', 'features/']);
    expect(await detectProjectFormat(projectDir)).toBe('scamp');
  });

  it('keeps a customised tsconfig.json and says what to change', async () => {
    await makeViews();
    await write('tsconfig.json', '{ "compilerOptions": { "strict": false } }\n');
    const result = await migrateNextjsToScamp(projectDir, '^0.2.1');
    expect(await read('tsconfig.json')).toBe('{ "compilerOptions": { "strict": false } }\n');
    expect(result.unmovedFiles.some((f) => f.startsWith('tsconfig.json'))).toBe(true);
  });
});
