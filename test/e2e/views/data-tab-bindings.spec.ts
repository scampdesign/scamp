import { test, expect } from '../fixtures/app';
import { clickContextMenuItem, createPageFromSidebar } from '../fixtures/components';
import { clickInFrame, dragInFrame, frameToClient, measureFrame, selectTool } from '../fixtures/canvas';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { canvasElement, canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

test.use({ projectOptions: { format: 'nextjs' } });

type Win = Parameters<typeof pageRoot>[0];

/** Right-click at a frame-local point: the canvas chrome intercepts locator clicks. */
const rightClickInFrame = async (window: Win, point: { x: number; y: number }): Promise<void> => {
  const metrics = await measureFrame(window);
  const client = frameToClient(metrics, point);
  await window.mouse.click(client.x, client.y, { button: 'right' });
};

/**
 * Build bindings through the Data tab alone — a text prop, a repeat with
 * a row-bound text, a show flag, and an event — and read the canonical
 * forms back from the view file. see docs/notes/view-bindings.md
 */
test.describe('Data tab bindings', () => {
  test('repeat, row-bound text, show, and an event land in the view file in canonical form', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createPageFromSidebar(window, 'feed');
    await expect(window.getByTitle('Select page root')).toHaveText('feed');

    // A card with a text inside it, and a note beside it.
    const cardId = await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 400, y: 200 });
    await selectTool(window, 't');
    await dragInFrame(window, { x: 80, y: 80 }, { x: 82, y: 82 });
    await window.keyboard.press('Escape');
    const label = canvasElementsByPrefix(window, 'text_').first();
    await expect(label).toBeVisible();
    const labelId = await label.getAttribute('data-scamp-id');
    const noteId = await drawAndSelectRect(window, { x: 40, y: 260 }, { x: 400, y: 320 });
    await waitForSaved(window);

    // Repeat the card over a list, from its right-click menu.
    await rightClickInFrame(window, { x: 300, y: 160 });
    await clickContextMenuItem(window, 'Repeat this');
    // Show the note only when a flag is on.
    const note = canvasElement(window, noteId).first();
    await rightClickInFrame(window, { x: 220, y: 290 });
    await clickContextMenuItem(window, 'Show only when');

    // Click empty canvas: that selects the page root, so the Data tab is
    // the way in. (With nothing selected at all, the panel shows the same
    // rows as a section — see properties-panel/visual-mode.spec.ts.)
    await window.keyboard.press('Escape');
    await dragInFrame(window, { x: 700, y: 700 }, { x: 700, y: 700 });
    await window.getByRole('radio', { name: 'Data' }).click();
    // This test drives several elements' bindings from one visit, so it
    // wants the whole view rather than the tab's default narrowing to
    // the selection. see views/data-tab-selection.spec.ts
    const showAll = window.getByRole('button', { name: 'Show all' });
    if ((await showAll.count()) > 0) await showAll.click();

    // The repeat row: rename the list, add a field, fill the first row.
    const repeat = window.getByTestId(`repeat-${cardId}`);
    await expect(repeat).toBeVisible();
    const listInput = repeat.getByLabel('List prop');
    await listInput.fill('posts');
    await listInput.press('Enter');
    const addField = repeat.getByLabel('Add a field to posts');
    await addField.fill('label');
    await addField.press('Enter');
    const cell = repeat.getByLabel('posts row 1 label');
    await cell.fill('Hello');
    await cell.press('Enter');
    await repeat.getByRole('button', { name: '+ Row' }).click();

    // The text inside the card binds a row field.
    const textRow = window.locator('[class*="row"]').filter({ hasText: 'Locked' }).first();
    await textRow.getByRole('radio', { name: 'Prop' }).click();
    const propName = window.getByLabel('Prop name').first();
    await propName.fill('item.label');
    await propName.press('Enter');

    // The show flag renames, and its sample turns off.
    const show = window.getByTestId(`show-${noteId}`);
    const flag = show.getByLabel('Show when prop');
    await flag.fill('hasNote');
    await flag.press('Enter');
    await show.getByLabel('hasNote sample').uncheck();
    await expect(note).toHaveCount(0);

    await waitForSaved(window);
    const { tsx } = await project.readView('Feed');
    expect(tsx).toContain('posts?: Array<{ id: string; label: string }>;');
    expect(tsx).toContain('hasNote?: boolean;');
    expect(tsx).toContain('  posts = [\n    { id: "1", label: "Hello" },\n    { id: "2", label: "" },\n  ],');
    expect(tsx).toContain('hasNote = false,');
    expect(tsx).toContain('{posts.map((item) => (');
    expect(tsx).toContain(`key={item.id}`);
    expect(tsx).toContain(`data-scamp-id="${labelId}" className={styles.${labelId}}>{item.label}<`);
    expect(tsx).toContain('{hasNote && (');
    expect(tsx).toContain("export const _scamp = { contract: 2, events: [] } as const;");

    // The canvas shows one card per row.
    await expect(canvasElement(window, cardId)).toHaveCount(2);
  });

  test('an attribute binds to a prop with its literal as the sample', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await createPageFromSidebar(window, 'links');
    await selectTool(window, 't');
    await dragInFrame(window, { x: 80, y: 80 }, { x: 82, y: 82 });
    await window.keyboard.press('Escape');
    const label = canvasElementsByPrefix(window, 'text_').first();
    await expect(label).toBeVisible();
    const labelId = await label.getAttribute('data-scamp-id');
    await waitForSaved(window);

    // Make it a link with a destination through the Element section.
    await clickInFrame(window, { x: 84, y: 84 });
    const elementSection = panelSection(window, 'Element');
    await elementSection.locator('select').nth(1).selectOption('external');
    const url = elementSection.getByPlaceholder('https://example.com');
    await url.click({ clickCount: 3 });
    await url.fill('https://example.com');
    await url.press('Enter');
    await waitForSaved(window);

    // Bind href in the Data tab, with the page root selected.
    await window.keyboard.press('Escape');
    await dragInFrame(window, { x: 700, y: 700 }, { x: 700, y: 700 });
    await window.getByRole('radio', { name: 'Data' }).click();
    const attr = window.getByTestId(`attr-${labelId}-href`);
    await attr.getByRole('radio', { name: 'Prop' }).click();
    await waitForSaved(window);

    const { tsx } = await project.readView('Links');
    expect(tsx).toContain('url?: string;');
    expect(tsx).toContain('url = "https://example.com"');
    expect(tsx).toContain('href={url}');
  });
});
