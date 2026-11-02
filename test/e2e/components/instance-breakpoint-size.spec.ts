import { test, expect } from '../fixtures/app';
import { switchBreakpoint } from '../fixtures/breakpoints';
import { pageRoot } from '../fixtures/selectors';

/**
 * A component instance at a non-desktop breakpoint must take the width
 * the CSS says it has at that breakpoint — whether the width comes from
 * the component's own `@media` rule or from a per-breakpoint size on the
 * instance. The preview always did; the canvas sized the wrapper from the
 * component root's DESKTOP fields and masked the media rule with an
 * inline width.
 */

const CARD_TSX = `import styles from './Card.module.css';

type CardProps = { className?: string };

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <div data-scamp-id="label_c001" className={styles.label_c001} />
    </div>
  );
}
`;

/** Hugs its 120px child at desktop; fills its parent on mobile. */
const CARD_CSS = `.root {
  width: fit-content;
  display: flex;
  background: #445566;
}

.label_c001 {
  width: 120px;
  height: 40px;
  background: #99aabb;
}

@media (max-width: 390px) {
  .root {
    width: 100%;
  }
}
`;

const PAGE_TSX = `import styles from './page.module.css';
import Card from '@/components/Card/Card';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Card data-scamp-instance-id="inst_a024" />
      <Card data-scamp-instance-id="inst_b025" className={styles.inst_b025} />
      <Card data-scamp-instance-id="inst_c026" className={styles.inst_c026} />
    </div>
  );
}
`;

/** The second instance is sized by the PAGE at mobile, not by the component. */
const PAGE_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inst_c026.inst_c026 {
  width: 300px;
}

@media (max-width: 390px) {
  .inst_b025.inst_b025 {
    width: 100%;
  }
}
`;

test.use({
  projectOptions: {
    format: 'nextjs',
    components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS }],
    pageContent: { home: { tsx: PAGE_TSX, css: PAGE_CSS } },
  },
});

const widths = async (
  window: Parameters<typeof pageRoot>[0]
): Promise<{ root: number; a: number; b: number; c: number }> =>
  window.evaluate(() => {
    // The iframe canvas experiment draws in its own document, with no instance wrapper.
    const drawn = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-canvas"] iframe')?.contentDocument;
    const doc = drawn ?? document;
    const w = (sel: string): number =>
      Math.round(doc.querySelector(sel)?.getBoundingClientRect().width ?? -1);
    const inst = (id: string): string => `[data-scamp-instance-id="${id}"] [data-scamp-id="root"], [data-scamp-instance-id="${id}"][data-scamp-id="root"]`;
    return {
      root: w(drawn ? '[data-element-id="root"]' : '[data-testid="canvas-frame"] [data-scamp-id="root"]'),
      a: w(inst('inst_a024')),
      b: w(inst('inst_b025')),
      c: w(inst('inst_c026')),
    };
  });

test.describe('canvas: component instances at a breakpoint', () => {
  test('hug at desktop, fill at mobile — from the component’s own media rule and from a page-side size', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    const desktop = await widths(window);
    expect(desktop.a, 'instance A hugs its child at desktop').toBe(120);
    expect(desktop.b, 'instance B hugs its child at desktop').toBe(120);
    expect(desktop.c, 'instance C takes the page’s desktop size').toBe(300);

    await switchBreakpoint(window, 'mobile', 'Mobile');
    await expect
      .poll(async () => (await widths(window)).root, { timeout: 5000 })
      .toBe(390);

    const mobile = await widths(window);
    expect(mobile.a, 'instance A fills via the component’s @media rule').toBe(mobile.root);
    expect(mobile.b, 'instance B fills via the page’s per-breakpoint size').toBe(mobile.root);
    expect(mobile.c, 'instance C keeps the page’s desktop size at mobile').toBe(300);
  });
});
