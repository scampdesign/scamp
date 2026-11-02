import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
/**
 * The stylesheet injected into the canvas frame is the PAGE's. A component
 * instance renders the COMPONENT's element tree inside that frame, and both
 * name their root `root` — so a page rule can reach into an instance and
 * repaint it.
 *
 * CSS modules keep the two apart on disk, which is why the preview has
 * never had this problem. The canvas needs per-instance prefixing to match;
 * until it has that, instance internals deliberately carry no page class.
 *
 * This test pins the outcome either way: whatever the mechanism, a page
 * rule must not style a component's internals.
 *
 * see docs/notes/canvas-injected-stylesheet.md
 */
const CARD_TSX = `import styles from './Card.module.css';

type CardProps = { className?: string };

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} />
  );
}
`;
const CARD_CSS = `.root {
  width: 120px;
  height: 60px;
  background: #445566;
}
`;
const PAGE_TSX = `import styles from './page.module.css';
import Card from '@/components/Card/Card';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Card data-scamp-instance-id="inst_a024" />
    </div>
  );
}
`;
/**
 * The page root carries values a component root would never want:
 * a viewport-height floor and generous padding. If either reaches the
 * instance, the leak is unmistakable.
 */
const PAGE_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
  padding: 40px;
  background: #101014;
}
`;
test.use({
    projectOptions: {
        format: 'nextjs',
        components: [{ name: 'Card', tsxContent: CARD_TSX, cssContent: CARD_CSS }],
        pageContent: { home: { tsx: PAGE_TSX, css: PAGE_CSS } },
    },
});
test.describe('canvas: page styles stay out of component instances', () => {
    test("a page's .root rule does not repaint a component's root", async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const measured = await window.evaluate(() => {
            // The iframe canvas experiment draws in its own document, with no instance wrapper.
            const drawn = document.querySelector('[data-testid="iframe-canvas"] iframe')?.contentDocument;
            const inner = (drawn ?? document).querySelector('[data-scamp-instance-id] [data-scamp-id="root"], [data-scamp-instance-id][data-scamp-id="root"]');
            if (!inner)
                return null;
            const el = inner;
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                padding: style.padding,
                minHeight: style.minHeight,
            };
        });
        expect(measured, 'the instance rendered a component root').not.toBeNull();
        // The component's own size, not the page root's.
        expect(measured?.width).toBe(120);
        expect(measured?.height).toBe(60);
        // The page root's padding and viewport floor must not have reached it.
        expect(measured?.padding).toBe('0px');
        expect(measured?.minHeight).toBe('0px');
    });
});
