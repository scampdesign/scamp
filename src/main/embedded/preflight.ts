import type { EmbeddedCheck, EmbeddedIdiom, EmbeddedPreflight } from '@shared/types';

/**
 * The setup screen's checks, decided from facts gathered elsewhere
 * (`preflightFacts.ts`). Pure, so every verdict is tested.
 *
 * The line between fixing and telling: Scamp does what is safe and
 * reversible (install, its own config, the branch, `git init` on request)
 * and reports what it can't own (the Node version, env files, a backend).
 * see docs/plans/embedded-scamp-plan.md
 */

/** What an attached folder says about itself, when it's a Rails app. see attach.ts */
export type RailsFacts = {
  rails: boolean;
  version: string | null;
  tailwind: boolean;
  turbo: boolean;
  viewComponent: boolean;
  /** Whether development wraps each template in `<!-- BEGIN path -->` comments; null when Scamp couldn't tell. */
  annotated: boolean | null;
  /** A subfolder holding the Rails app, when the chosen folder has no Gemfile. */
  appIn: string | null;
};

export type PreflightFacts = {
  folder: string;
  name: string;
  signedIn: boolean;
  agentConnected: boolean;
  /** The user chose to have their own agent (Claude Code and others) write changes. */
  ownAgent: boolean;
  gitInstalled: boolean;
  isRepo: boolean;
  /** `Name <email>`, or null when git has no identity configured. */
  gitUser: string | null;
  hasRemote: boolean;
  dirty: boolean;
  nodeVersion: string | null;
  enginesNode: string | null;
  packageManager: string | null;
  packageManagerAvailable: boolean;
  /** Null when the folder isn't a React app at all. */
  framework: 'vite' | 'next' | 'cra' | null;
  frameworkError: string | null;
  needsInstall: boolean;
  /** Which React plugin the Vite config uses, which decides source mapping. */
  reactPlugin: 'babel' | 'swc' | null;
  envExampleWithoutEnv: string | null;
  missingEnvVars: string[];
  backendHints: string[];
  idioms: EmbeddedIdiom[];
  /** Set when Scamp attaches to an app already running, instead of starting it. */
  attach: { url: string; reachable: boolean; error: string | null; rails: RailsFacts } | null;
};

/** The lowest major version a range allows, for the ranges package.json uses. */
export const minimumMajor = (range: string): number | null => {
  const m = /(?:>=|\^|~|=)?\s*v?(\d+)/.exec(range.trim());
  return m === null ? null : Number(m[1]);
};

/** Whether `version` (`v20.11.1`) meets `range`; null when the range can't be read. */
export const nodeSatisfies = (version: string, range: string): boolean | null => {
  const have = Number(/v?(\d+)/.exec(version)?.[1] ?? NaN);
  const want = minimumMajor(range);
  if (Number.isNaN(have) || want === null) return null;
  return have >= want;
};

/** Vite needs Node 18 or later; a project can ask for more in `engines`. */
const DEFAULT_NODE_RANGE = '>=18';

export const evaluatePreflight = (f: PreflightFacts): EmbeddedPreflight => {
  const checks: EmbeddedCheck[] = [];
  const add = (check: EmbeddedCheck): void => {
    checks.push(check);
  };

  // Accounts
  add(
    f.signedIn
      ? { id: 'scamp', group: 'accounts', label: 'Signed in to Scamp', status: 'pass', detail: 'The Scamp Agent is available.' }
      : { id: 'scamp', group: 'accounts', label: 'Sign in to Scamp', status: 'fail', detail: 'The Scamp Agent writes your changes, and it needs you signed in.', fix: 'sign-in' }
  );
  add(
    f.ownAgent
      ? { id: 'agent', group: 'accounts', label: 'Your own agent writes changes', status: 'pass', detail: 'Claude Code, Cursor, Gemini CLI or Kiro, signed in as you already are. Scamp connects it when the app starts; the Changes tab says how.' }
      : f.agentConnected
        ? { id: 'agent', group: 'accounts', label: 'Scamp Agent connected', status: 'pass', detail: 'Your Anthropic key is set.' }
        : { id: 'agent', group: 'accounts', label: 'Choose who writes your changes', status: 'fail', detail: 'Add an Anthropic key for the Scamp Agent, or use an agent you already have, such as Claude Code.', fix: 'connect-agent' }
  );
  if (!f.gitInstalled) {
    add({ id: 'git', group: 'accounts', label: 'Install git', status: 'fail', detail: 'Scamp keeps every change on a git branch so you can review and undo it. Install git, then check again.' });
  } else if (!f.isRepo) {
    add({ id: 'git', group: 'accounts', label: 'This folder has no git history', status: 'fail', detail: 'Scamp keeps every change on a git branch. Initialize git to start one; your .env files and node_modules stay out of it.', fix: 'git-init' });
  } else if (f.gitUser === null) {
    add({ id: 'git', group: 'accounts', label: 'Set your git name and email', status: 'fail', detail: 'Git needs a name and email to record changes. Run git config --global user.name and user.email, then check again.' });
  } else {
    add({ id: 'git', group: 'accounts', label: 'Git is ready', status: 'pass', detail: `Changes are recorded as ${f.gitUser}.` });
  }
  if (f.isRepo && !f.hasRemote) {
    add({ id: 'remote', group: 'accounts', label: 'No GitHub remote', status: 'warn', detail: 'You can work and commit locally. Pushing needs a remote named origin.' });
  }

  if (f.attach !== null) {
    attachChecks(f, f.attach, add);
    return {
      folder: f.folder,
      name: f.name,
      checks,
      canStart: !checks.some((c) => c.status === 'fail'),
      idioms: f.idioms,
      framework: f.attach.rails.rails ? 'rails' : 'server',
      attachUrl: f.attach.url,
    };
  }

  // Environment
  const range = f.enginesNode ?? DEFAULT_NODE_RANGE;
  if (f.nodeVersion === null) {
    add({ id: 'node', group: 'environment', label: 'Install Node.js', status: 'fail', detail: 'Scamp couldn’t find Node.js, which runs the project. Install it from nodejs.org, then check again.' });
  } else {
    const ok = nodeSatisfies(f.nodeVersion, range);
    add(
      ok === false
        ? { id: 'node', group: 'environment', label: `Node ${f.nodeVersion} is too old`, status: 'fail', detail: `The project needs Node ${range}. Install a newer version, then check again.` }
        : { id: 'node', group: 'environment', label: `Node ${f.nodeVersion}`, status: ok === null ? 'warn' : 'pass', detail: ok === null ? `Scamp couldn’t read the project’s Node range (${range}).` : `Meets ${range}.` }
    );
  }
  if (f.packageManager !== null) {
    add(
      f.packageManagerAvailable
        ? { id: 'pm', group: 'environment', label: `Package manager: ${f.packageManager}`, status: 'pass', detail: 'Found from the lockfile.' }
        : { id: 'pm', group: 'environment', label: `Install ${f.packageManager}`, status: 'fail', detail: `The lockfile is ${f.packageManager}’s, and Scamp couldn’t find it.` }
    );
  }
  if (f.framework === null) {
    add({ id: 'bundler', group: 'environment', label: 'Not a React app', status: 'fail', detail: f.frameworkError ?? 'Scamp couldn’t find React in package.json.' });
  } else if (f.framework === 'cra') {
    add({ id: 'bundler', group: 'environment', label: 'Create React App isn’t supported yet', status: 'fail', detail: 'Embedded Scamp runs Vite and Next.js projects for now.' });
  } else if (f.framework === 'next') {
    add({ id: 'bundler', group: 'environment', label: 'Next.js', status: 'pass', detail: 'Scamp runs your dev script for you.' });
  } else {
    add({ id: 'bundler', group: 'environment', label: 'Vite + React', status: 'pass', detail: 'Scamp runs the dev server for you.' });
  }
  if (f.envExampleWithoutEnv !== null) {
    add({ id: 'env', group: 'environment', label: 'An env file may be missing', status: 'warn', detail: `The project has ${f.envExampleWithoutEnv} but no .env. Copy it to .env and fill it in if the app needs it.` });
  }
  if (f.missingEnvVars.length > 0) {
    const names = f.missingEnvVars.slice(0, 4).join(', ') + (f.missingEnvVars.length > 4 ? ', …' : '');
    add({ id: 'env-vars', group: 'environment', label: 'Env variables not set', status: 'warn', detail: `The code reads ${names}, and no .env file sets them.` });
  }
  if (f.backendHints.length > 0) {
    add({ id: 'backend', group: 'environment', label: 'The app may need a backend', status: 'warn', detail: `${f.backendHints.join('; ')}. Pages that load data may be empty unless it’s running.` });
  }

  // Project
  if (f.framework === 'vite' || f.framework === 'next') {
    if (f.needsInstall) {
      add({ id: 'install', group: 'project', label: 'Install packages', status: 'action', detail: `Scamp will run ${f.packageManager ?? 'npm'} install.` });
    }
    add({
      id: 'instrument',
      group: 'project',
      label: 'Map elements to source',
      status: f.framework === 'next' ? 'pass' : f.reactPlugin === null ? 'warn' : 'action',
      detail: f.framework === 'next'
        ? 'Scamp finds each element’s file from React’s debug info and the dev server’s source maps. Nothing is written to your project.'
        : f.reactPlugin === null
          ? 'No @vitejs/plugin-react in the Vite config, so elements may map to components but not to lines. Scamp will still run the app.'
          : 'Scamp runs Vite with its own config in .scamp/, which tags each element with its file and line. Your files and git history are untouched.',
    });
    if (f.isRepo) add(branchCheck(f.dirty));
  }

  return {
    folder: f.folder,
    name: f.name,
    checks,
    canStart: !checks.some((c) => c.status === 'fail'),
    idioms: f.idioms,
    framework: f.framework,
    attachUrl: null,
  };
};

/** The project's checks for an app Scamp attaches to: it answers, what it is, and its template comments. */
const attachChecks = (f: PreflightFacts, attach: NonNullable<PreflightFacts['attach']>, add: (check: EmbeddedCheck) => void): void => {
  const { rails } = attach;
  add(
    attach.reachable
      ? { id: 'app', group: 'environment', label: 'Your app is running', status: 'pass', detail: `It answers at ${attach.url}. Scamp loads it and never starts or stops it.` }
      : { id: 'app', group: 'environment', label: 'Start your app', status: 'fail', detail: `${attach.error ?? 'Nothing answered.'} Start it at ${attach.url}, then check again.` }
  );
  if (rails.appIn !== null) {
    add({ id: 'bundler', group: 'environment', label: 'Choose the Rails app’s folder', status: 'warn', detail: `This folder has no Gemfile, and ${rails.appIn}/ has one. Choose ${rails.appIn}/ so the template paths Rails gives match the files.` });
  } else if (rails.rails) {
    const parts = [rails.viewComponent ? 'ViewComponent' : null, rails.turbo ? 'Turbo' : null, rails.tailwind ? 'Tailwind' : null].filter((p): p is string => p !== null);
    add({ id: 'bundler', group: 'environment', label: `Rails${rails.version === null ? '' : ` ${rails.version}`}`, status: 'pass', detail: parts.length > 0 ? `With ${parts.join(', ')}.` : 'Server-rendered templates.' });
    add(
      rails.annotated === true
        ? { id: 'instrument', group: 'project', label: 'Map elements to templates', status: 'pass', detail: 'Rails marks where each template starts and ends, so Scamp finds the template, partial or component an element comes from. Nothing is written to your project.' }
        : { id: 'instrument', group: 'project', label: 'Turn on template comments', status: 'warn', detail: 'Add config.action_view.annotate_rendered_view_with_filenames = true to config/environments/development.rb and restart the app, so Scamp finds each element’s template. Without it, the agent searches for each element.' }
    );
  } else {
    add({ id: 'bundler', group: 'environment', label: 'A running app', status: 'pass', detail: 'Scamp edits the page it serves, and the agent searches the project for each element’s code.' });
  }
  if (f.isRepo) add(branchCheck(f.dirty));
};

const branchCheck = (dirty: boolean): EmbeddedCheck => ({
  id: 'branch',
  group: 'project',
  label: 'Work on a new branch',
  status: 'action',
  detail: dirty
    ? 'Scamp will create a scamp/ branch. Your uncommitted changes come with you; Scamp commits only the files its agent changes.'
    : 'Scamp will create a scamp/ branch, so your main branch is never touched.',
});
