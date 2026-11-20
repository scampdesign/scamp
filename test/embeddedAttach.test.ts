import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { annotatesTemplates, gemsIn, normalizeAttachUrl, parseRailsRoutes, readRailsFacts, waitForCssBuild } from '../src/main/embedded/attach';
import { resolveSource } from '../src/main/embedded/sourceResolve';

/** Attaching to a running app: its address, what the folder is, and its routes. see docs/plans/embedded-rails-plan.md */

describe('normalizeAttachUrl', () => {
  it('reads a port, a host and port, or a full URL', () => {
    expect(normalizeAttachUrl('3010')).toBe('http://localhost:3010/');
    expect(normalizeAttachUrl(' localhost:3000 ')).toBe('http://localhost:3000/');
    expect(normalizeAttachUrl('https://app.test/login')).toBe('https://app.test/login');
  });

  it('refuses what isn’t a web address', () => {
    expect(normalizeAttachUrl('')).toBeNull();
    expect(normalizeAttachUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeAttachUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAttachUrl('not a url')).toBeNull();
  });
});

describe('gemsIn', () => {
  it('lists the gems a Gemfile asks for, ignoring comments and other lines', () => {
    const gemfile = 'source "https://rubygems.org"\ngem "rails", "~> 8.1.3"\n  gem \'turbo-rails\'\n# gem "devise"\ngroup :development do\n  gem "web-console"\nend\n';
    expect([...gemsIn(gemfile)]).toEqual(['rails', 'turbo-rails', 'web-console']);
  });
});

describe('annotatesTemplates', () => {
  it('reads the setting, and ignores it commented out', () => {
    expect(annotatesTemplates('  config.action_view.annotate_rendered_view_with_filenames = true\n')).toBe(true);
    expect(annotatesTemplates('  config.action_view.annotate_rendered_view_with_filenames = false\n')).toBe(false);
    expect(annotatesTemplates('  # config.action_view.annotate_rendered_view_with_filenames = true\n')).toBeNull();
    expect(annotatesTemplates('')).toBeNull();
  });
});

describe('parseRailsRoutes', () => {
  const table = [
    '                                  Prefix Verb     URI Pattern                                       Controller#Action',
    '                             admin_login GET      /admin/login(.:format)                            admin/sessions#new',
    '                                         POST     /admin/login(.:format)                            admin/sessions#create',
    '                                patients GET      /patients(.:format)                               patients#index',
    '                                 patient GET      /patients/:id(.:format)                           patients#show',
    '                                    root GET      /                                                 redirect(301, /login)',
    '                      rails_service_blob GET      /rails/active_storage/blobs/redirect/:signed_id/*filename(.:format) active_storage/blobs/redirect#show',
    '                                  search GET|POST /search(.:format)                                 search#index',
    '                                   about GET      (/:locale)/about(.:format)                        pages#about',
  ].join('\n');

  it('keeps the GET pages with nothing to fill in, without optional parts', () => {
    expect(parseRailsRoutes(table)).toEqual(['/', '/about', '/admin/login', '/patients', '/search']);
  });

  it('returns nothing for output that isn’t a routes table', () => {
    expect(parseRailsRoutes('bundler: command not found: rails')).toEqual([]);
  });
});

describe('readRailsFacts and waitForCssBuild', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-attach-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads a Rails app’s gems, version and template comments', async () => {
    await fs.mkdir(path.join(dir, 'config', 'environments'), { recursive: true });
    await fs.writeFile(path.join(dir, 'Gemfile'), 'gem "rails"\ngem "tailwindcss-rails"\ngem "view_component"\n');
    await fs.writeFile(path.join(dir, 'Gemfile.lock'), 'GEM\n  specs:\n    rails (8.1.4.1)\n      actioncable (= 8.1.4.1)\n');
    await fs.writeFile(path.join(dir, 'config', 'environments', 'development.rb'), 'config.action_view.annotate_rendered_view_with_filenames = true\n');
    expect(await readRailsFacts(dir)).toEqual({
      rails: true,
      version: '8.1.4.1',
      tailwind: true,
      turbo: false,
      viewComponent: true,
      annotated: true,
      appIn: null,
    });
  });

  it('points to the subfolder holding the Rails app when the folder has no Gemfile', async () => {
    await fs.mkdir(path.join(dir, 'riq'));
    await fs.writeFile(path.join(dir, 'riq', 'Gemfile'), 'gem "rails"\n');
    expect(await readRailsFacts(dir)).toMatchObject({ rails: false, appIn: 'riq' });
  });

  it('returns at once when the app builds no CSS, and once a build is newer than the run', async () => {
    const started = Date.now();
    await waitForCssBuild(dir, Date.now(), 2000);
    expect(Date.now() - started).toBeLessThan(500);

    const builds = path.join(dir, 'app', 'assets', 'builds');
    await fs.mkdir(builds, { recursive: true });
    await fs.writeFile(path.join(builds, 'tailwind.css'), 'a{}');
    const since = Date.now() + 1000;
    setTimeout(() => {
      const later = new Date(since + 1000);
      void fs.utimes(path.join(builds, 'tailwind.css'), later, later);
    }, 200);
    const t0 = Date.now();
    await waitForCssBuild(dir, since, 2500);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('resolveSource for a Rails template', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-template-')));
    await fs.mkdir(path.join(dir, 'app', 'views', 'patients'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'app', 'views', 'patients', '_card.html.erb'),
      '<li class="card">\n  <div class="card__top">\n    <h2 class="card__name"><%= patient.name %></h2>\n  </div>\n  <p class="card__note">Next visit</p>\n</li>\n'
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('picks the line by the element’s tag, classes and text, from a relative or absolute path', async () => {
    const rel = { kind: 'template' as const, path: 'app/views/patients/_card.html.erb' };
    expect(await resolveSource(dir, 'http://localhost:3010', rel, { tag: 'h2', classes: ['card__name'], text: 'Ada' })).toBe('app/views/patients/_card.html.erb:3:5');
    const abs = { kind: 'template' as const, path: path.join(dir, 'app/views/patients/_card.html.erb') };
    expect(await resolveSource(dir, 'http://localhost:3010', abs, { tag: 'p', classes: ['card__note'], text: 'Next visit' })).toBe('app/views/patients/_card.html.erb:5:3');
  });

  it('gives the file’s first line when no tag matches, and nothing outside the project', async () => {
    const rel = { kind: 'template' as const, path: 'app/views/patients/_card.html.erb' };
    expect(await resolveSource(dir, 'http://localhost:3010', rel, { tag: 'table', classes: [], text: '' })).toBe('app/views/patients/_card.html.erb:1:1');
    expect(await resolveSource(dir, 'http://localhost:3010', { kind: 'template', path: '/etc/passwd' }, { tag: 'p', classes: [], text: '' })).toBeNull();
    expect(await resolveSource(dir, 'http://localhost:3010', { kind: 'template', path: '../outside.erb' }, { tag: 'p', classes: [], text: '' })).toBeNull();
  });
});
