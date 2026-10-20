import { describe, it, expect } from 'vitest';

import { componentPreviewName, previewTargetFor } from '@lib/previewTarget';
import type { ComponentFile, PageFile, ProjectData, RouteFile } from '@shared/types';

/** Where the Preview button goes. A component previews alone, to try its interactions. */

const component = (name: string, kind: 'component' | 'view'): ComponentFile =>
  ({ name, kind, tsxPath: '', cssPath: '', tsxContent: '', cssContent: '' }) as ComponentFile;

const project: Pick<ProjectData, 'pages' | 'components' | 'routes'> = {
  pages: [{ name: 'home' } as PageFile, { name: 'about' } as PageFile],
  components: [component('Home', 'view'), component('ButtonTest', 'view'), component('Menu', 'component')],
  routes: [{ kind: 'page', path: '/button-test', view: 'ButtonTest' } as RouteFile],
};

const none = { page: null, view: null, component: null };

describe('previewTargetFor', () => {
  it('previews a component alone in a Scamp framework project, beside the views', () => {
    const target = previewTargetFor('scamp', { ...none, component: 'Menu' }, project);
    const name = componentPreviewName('Menu');
    expect(target?.pageName).toBe(name);
    expect(target?.routes?.[name]).toBe('/_components/Menu');
    expect(target?.pageNames).toEqual(['home', 'button-test', name]);
  });

  it('previews a view at the route that renders it, else with its defaults', () => {
    const target = previewTargetFor('scamp', { ...none, view: 'ButtonTest' }, project);
    expect(target?.pageName).toBe('button-test');
    expect(target?.routes).toEqual({ home: '/_views/Home', 'button-test': '/button-test' });
  });

  it('previews a Next.js page, or a view at its wrapper page', () => {
    expect(previewTargetFor('nextjs', { ...none, page: 'about' }, project)).toEqual({ pageName: 'about', pageNames: ['home', 'about'] });
    expect(previewTargetFor('nextjs', { ...none, view: 'ButtonTest' }, project)?.pageName).toBe('button-test');
  });

  it('has nothing to preview for a Next.js component, a legacy project, or nothing open', () => {
    expect(previewTargetFor('nextjs', { ...none, component: 'Menu' }, project)).toBeNull();
    expect(previewTargetFor('legacy', { ...none, page: 'home' }, project)).toBeNull();
    expect(previewTargetFor('scamp', none, project)).toBeNull();
  });
});
