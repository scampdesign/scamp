import { describe, expect, it } from 'vitest';

import { detectIdioms } from '../src/main/embedded/idiom';
import { evaluatePreflight, minimumMajor, nodeSatisfies, type PreflightFacts } from '../src/main/embedded/preflight';
import { envKeys, viteEnvReads } from '../src/main/embedded/preflightFacts';

const ready: PreflightFacts = {
  folder: '/p/app',
  name: 'app',
  signedIn: true,
  agentConnected: true,
  gitInstalled: true,
  isRepo: true,
  gitUser: 'Ada <ada@example.com>',
  hasRemote: true,
  dirty: false,
  nodeVersion: 'v22.3.0',
  enginesNode: null,
  packageManager: 'npm',
  packageManagerAvailable: true,
  framework: 'vite',
  frameworkError: null,
  needsInstall: false,
  reactPlugin: 'babel',
  envExampleWithoutEnv: null,
  missingEnvVars: [],
  backendHints: [],
  idioms: ['css-modules'],
};

const statusOf = (facts: PreflightFacts, id: string): string | undefined =>
  evaluatePreflight(facts).checks.find((c) => c.id === id)?.status;

describe('evaluatePreflight', () => {
  it('can start a ready Vite project, and lists what Start will do', () => {
    const report = evaluatePreflight(ready);
    expect(report.canStart).toBe(true);
    expect(report.checks.filter((c) => c.status === 'action').map((c) => c.id)).toEqual(['instrument', 'branch']);
  });

  it('blocks Start when signed out, offering the sign-in fix', () => {
    const report = evaluatePreflight({ ...ready, signedIn: false });
    expect(report.canStart).toBe(false);
    expect(report.checks.find((c) => c.id === 'scamp')).toMatchObject({ status: 'fail', fix: 'sign-in' });
  });

  it('blocks Start without an agent key, offering to connect one', () => {
    expect(evaluatePreflight({ ...ready, agentConnected: false }).checks.find((c) => c.id === 'agent')).toMatchObject({ status: 'fail', fix: 'connect-agent' });
  });

  it('offers git init for a folder without git, and asks for an identity when git has none', () => {
    expect(evaluatePreflight({ ...ready, isRepo: false }).checks.find((c) => c.id === 'git')).toMatchObject({ status: 'fail', fix: 'git-init' });
    expect(statusOf({ ...ready, gitUser: null }, 'git')).toBe('fail');
    expect(statusOf({ ...ready, gitInstalled: false, isRepo: false }, 'git')).toBe('fail');
  });

  it('warns, without blocking, when there is no remote to push to', () => {
    const report = evaluatePreflight({ ...ready, hasRemote: false });
    expect(report.checks.find((c) => c.id === 'remote')?.status).toBe('warn');
    expect(report.canStart).toBe(true);
  });

  it('runs Next.js as it is, writing nothing for source mapping', () => {
    const report = evaluatePreflight({ ...ready, framework: 'next', reactPlugin: null });
    expect(report.checks.find((c) => c.id === 'bundler')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'instrument')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'instrument')?.detail).toContain('Nothing is written to your project');
    expect(report.checks.some((c) => c.id === 'branch')).toBe(true);
    expect(report.framework).toBe('next');
    expect(report.canStart).toBe(true);
  });

  it('refuses CRA for now, and a folder that is not React', () => {
    expect(statusOf({ ...ready, framework: 'cra' }, 'bundler')).toBe('fail');
    const none = evaluatePreflight({ ...ready, framework: null, frameworkError: 'No React in package.json.' });
    expect(none.checks.find((c) => c.id === 'bundler')?.detail).toBe('No React in package.json.');
    expect(none.canStart).toBe(false);
  });

  it('checks Node against the project’s engines range', () => {
    expect(statusOf({ ...ready, nodeVersion: 'v18.19.0', enginesNode: '>=20' }, 'node')).toBe('fail');
    expect(statusOf({ ...ready, nodeVersion: 'v20.1.0', enginesNode: '^20.0.0' }, 'node')).toBe('pass');
    expect(statusOf({ ...ready, nodeVersion: null }, 'node')).toBe('fail');
    expect(statusOf({ ...ready, enginesNode: 'lts/*' }, 'node')).toBe('warn');
  });

  it('reports env files, env variables and a backend as warnings only', () => {
    const report = evaluatePreflight({
      ...ready,
      envExampleWithoutEnv: '.env.example',
      missingEnvVars: ['VITE_API_URL'],
      backendHints: ['It uses Supabase'],
    });
    expect(report.checks.filter((c) => c.status === 'warn').map((c) => c.id)).toEqual(['env', 'env-vars', 'backend']);
    expect(report.canStart).toBe(true);
  });

  it('adds an install step when node_modules is missing, and warns when no React plugin maps lines', () => {
    expect(statusOf({ ...ready, needsInstall: true }, 'install')).toBe('action');
    expect(statusOf({ ...ready, reactPlugin: null }, 'instrument')).toBe('warn');
  });

  it('names the uncommitted changes the branch carries', () => {
    expect(evaluatePreflight({ ...ready, dirty: true }).checks.find((c) => c.id === 'branch')?.detail).toMatch(/uncommitted/);
  });
});

describe('nodeSatisfies', () => {
  it('reads the lowest major of the common range forms', () => {
    expect(minimumMajor('>=18.0.0')).toBe(18);
    expect(minimumMajor('^20.11')).toBe(20);
    expect(minimumMajor('22.x')).toBe(22);
    expect(minimumMajor('lts/*')).toBeNull();
  });

  it('compares majors, and says when it cannot tell', () => {
    expect(nodeSatisfies('v20.11.1', '>=18')).toBe(true);
    expect(nodeSatisfies('v16.0.0', '>=18')).toBe(false);
    expect(nodeSatisfies('v20.0.0', 'lts/*')).toBeNull();
  });
});

describe('detectIdioms', () => {
  it('finds Tailwind from its dependency or config file', () => {
    expect(detectIdioms(['tailwindcss'], ['src/index.css'])).toContain('tailwind');
    expect(detectIdioms([], ['tailwind.config.ts'])).toContain('tailwind');
  });

  it('finds CSS Modules and styled-components', () => {
    expect(detectIdioms([], ['src/Card.module.css'])).toEqual(['css-modules']);
    expect(detectIdioms(['styled-components'], [])).toEqual(['styled-components']);
  });

  it('falls back to plain CSS when nothing else is found', () => {
    expect(detectIdioms([], [])).toEqual(['plain-css']);
    expect(detectIdioms([], ['src/App.css', 'src/Card.module.css'])).toEqual(['css-modules', 'plain-css']);
  });
});

describe('env helpers', () => {
  it('reads the keys an env file sets, skipping comments', () => {
    expect(envKeys('# a comment\nVITE_A=1\nexport VITE_B="2"\n\n  NOT VALID\n')).toEqual(['VITE_A', 'VITE_B']);
  });

  it('reads the VITE_ variables a source file uses', () => {
    expect(viteEnvReads('const a = import.meta.env.VITE_API_URL; import.meta.env.MODE')).toEqual(['VITE_API_URL']);
  });
});
