import { test, expect } from '../fixtures/app';
import {
  clickContextMenuItem,
  confirmDialog,
  createComponentFromSidebar,
  createPageFromSidebar,
  openPageContextMenu,
  openPagesSection,
  waitForConfirmDialog,
} from '../fixtures/components';
import { addPageButton, pageRoot, pageSidebarItem } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

test.use({ projectOptions: { format: 'nextjs' } });

/**
 * A page's design is a view. "Add page" creates views/<Name>/ plus a
 * one-line route wrapper, lists it by slug beside legacy pages, and opens
 * it like a page — no component-editor banner.
 * see docs/plans/framework-phase-1-plan.md, step 2
 */
test.describe('pages are views', () => {
  test('Add page creates a view, its route wrapper, and opens it as a page', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    await createPageFromSidebar(window, 'hero-card');
    await expect(pageSidebarItem(window, 'hero-card')).toBeVisible();
    // Opens like a page: header badge shows the slug, no component banner.
    await expect(window.getByTitle('Select page root')).toHaveText('hero-card');
    await expect(window.getByTestId('component-editor-banner')).toHaveCount(0);

    expect(await project.viewExists('HeroCard')).toBe(true);
    const { tsx, css } = await project.readView('HeroCard');
    expect(tsx).toContain(
      'export default function HeroCard({ className }: HeroCardProps)'
    );
    expect(tsx).toContain('export const _scamp = { contract: 2, events: [] } as const;');
    expect(css).toContain('.root');

    const wrapper = await project.readFile('app/hero-card/page.tsx');
    expect(wrapper).toContain("import HeroCard from '@/views/HeroCard/HeroCard';");
    expect(wrapper).toContain('return <HeroCard />;');
    expect(await project.fileExists('app/hero-card/page.module.css')).toBe(false);
  });

  test('the slug and the home page share one namespace', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openPagesSection(window);
    await addPageButton(window).click();
    const input = window.getByPlaceholder('page-name');
    await input.fill('home');
    await input.press('Enter');
    // The inline validator rejects the duplicate; nothing is written.
    expect(await project.viewExists('Home')).toBe(false);
  });

  test('a view cannot take a component\'s name', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createComponentFromSidebar(window, 'Card');
    await createPageFromSidebar(window, 'card');
    await expect(window.getByText(/already uses this name/)).toBeVisible();
    expect(await project.viewExists('Card')).toBe(false);
  });

  test('Esc does not leave a view, and it can be drawn on and saved', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createPageFromSidebar(window, 'landing');
    await expect(window.getByTitle('Select page root')).toHaveText('landing');
    await window.keyboard.press('Escape');
    await expect(window.getByTitle('Select page root')).toHaveText('landing');
    await waitForSaved(window);
    expect(await project.viewExists('Landing')).toBe(true);
  });

  test('deleting a view page removes its folder and its route wrapper', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createPageFromSidebar(window, 'pricing');
    await expect(pageSidebarItem(window, 'pricing')).toBeVisible();
    expect(await project.fileExists('app/pricing/page.tsx')).toBe(true);

    await openPageContextMenu(window, 'pricing');
    await clickContextMenuItem(window, 'Delete');
    await waitForConfirmDialog(window, /Delete page "pricing"/);
    await confirmDialog(window, /^Delete page$/);

    await expect(pageSidebarItem(window, 'pricing')).toHaveCount(0);
    expect(await project.viewExists('Pricing')).toBe(false);
    expect(await project.fileExists('app/pricing/page.tsx')).toBe(false);
  });

  test('renaming a view page by slug moves the folder and the wrapper', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createPageFromSidebar(window, 'team');
    await expect(pageSidebarItem(window, 'team')).toBeVisible();

    await openPageContextMenu(window, 'team');
    await clickContextMenuItem(window, 'Rename');
    const input = window.getByPlaceholder('page-name');
    await input.fill('our-team');
    await input.press('Enter');

    await expect(pageSidebarItem(window, 'our-team')).toBeVisible();
    await expect(pageSidebarItem(window, 'team')).toHaveCount(0);
    expect(await project.viewExists('OurTeam')).toBe(true);
    expect(await project.viewExists('Team')).toBe(false);
    expect(await project.fileExists('app/our-team/page.tsx')).toBe(true);
    expect(await project.fileExists('app/team/page.tsx')).toBe(false);
  });
});
