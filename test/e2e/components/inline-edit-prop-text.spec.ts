import { test, expect } from '../fixtures/app';
import { canvasLocator, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

test.use({
  projectOptions: {
    format: 'nextjs',
    components: [
      {
        name: 'Card',
        tsxContent: `import styles from './Card.module.css';

type CardProps = { title?: string };

export default function Card({ title = "Default" }: CardProps) {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_aaaa" className={styles.text_aaaa}>{title}</p>
    </div>
  );
}
`,
        cssContent: `.root {
  width: 200px;
  min-height: 100px;
  background: #f0f0f0;
}

.text_aaaa {
  color: #111;
  font-size: 16px;
}
`,
      },
    ],
    pageContent: {
      home: {
        tsx: `import styles from './page.module.css';
import Card from '@/components/Card/Card';

export default function HomePage() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Card data-scamp-instance-id="inst_xxxx" title="Hello" />
    </div>
  );
}
`,
        css: `.root {
  width: 100%;
  min-height: 900px;
  background: #fff;
}
`,
      },
    },
  },
});

test.describe('components: inline-edit of prop text on an instance', () => {
  test('dashed outline appears only when instance is selected, and double-click opens contenteditable', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await waitForSaved(window);

    // The instance renders inline; the prop-text inside it carries
    // `data-scamp-prop="title"`.
    const propText = canvasLocator(window, '[data-scamp-prop="title"]');
    await expect(propText).toBeVisible();

    // No selection yet — no dashed outline.
    let outline = await propText.evaluate(
      (el) => globalThis.getComputedStyle(el).outlineStyle
    );
    expect(outline).not.toBe('dashed');

    // Click the prop-text once. The canvas chrome layer routes the hit
    // to the wrapper, so this selects the component instance — not
    // the prop-text.
    // Select the instance via its layers-panel row — the canvas
    // chrome layer sits on top of the prop-text and breaks
    // Playwright's actionability check on the rendered text itself.
    // The seeded instance id is `inst_xxxx`; the parser slices the
    // `inst_` prefix for the canvas element id (`xxxx`).
    const layerRow = window.locator(
      '[data-testid="layers-row"][data-element-id="xxxx"]'
    );
    await layerRow.locator('button').first().click();

    // Now the instance is selected — the dashed affordance should
    // show on the prop-text.
    outline = await propText.evaluate(
      (el) => globalThis.getComputedStyle(el).outlineStyle
    );
    expect(outline).toBe('dashed');

    // Double-click on the canvas at the prop-text's center. The
    // chrome layer's `handleDoubleClick` walks `propTextHitTest`
    // and dispatches `setEditingInstanceProp`, which re-renders the
    // prop-text as a contenteditable target.
    const box = await propText.boundingBox();
    if (!box) throw new Error('prop-text has no bounding box');
    await window.mouse.dblclick(
      box.x + box.width / 2,
      box.y + box.height / 2
    );
    await expect(propText).toHaveAttribute('contenteditable', 'true');
  });
});
