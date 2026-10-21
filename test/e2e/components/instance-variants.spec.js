import { test, expect } from '../fixtures/app';
import { panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * Picking a component variant on an instance: the panel's select writes
 * the prop, and the canvas draws that value. see docs/plans/component-variants-plan.md
 */
const BUTTON_TSX = `import styles from './Button.module.css';

type ButtonProps = {
  variant?: "default" | "outline";
  className?: string;
};

export default function Button({ variant = "default", className }: ButtonProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} data-variant={variant} />
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;
const BUTTON_CSS = `.root {
  width: 120px;
  height: 40px;
  background: #ff0000;
  position: relative;
}

.root[data-variant="outline"] {
  background: #0000ff;
}
`;
const PAGE_TSX = `import styles from './home.module.css';
import Button from '@/components/Button/Button';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Button data-scamp-instance-id="inst_a1b2" />
    </div>
  );
}
`;
const PAGE_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  background: #ffffff;
  position: relative;
  display: flex;
  padding: 40px;
}
`;
test.use({
    projectOptions: {
        format: 'nextjs',
        components: [{ name: 'Button', tsxContent: BUTTON_TSX, cssContent: BUTTON_CSS }],
        pageContent: { home: { tsx: PAGE_TSX, css: PAGE_CSS } },
    },
});
test.describe('components: an instance’s variant', () => {
    test('the panel picks a value, the file names it, and the canvas draws it', async ({ window, project }) => {
        await expect(pageRoot(window)).toBeVisible();
        const instance = window.locator('[data-scamp-instance-id="inst_a1b2"]');
        const inner = instance.locator('[data-scamp-id="root"]');
        await expect(inner).toHaveCSS('background-color', 'rgb(255, 0, 0)');
        // The interaction layer takes the click, so click where the instance is.
        const box = await instance.boundingBox();
        if (box === null)
            throw new Error('instance has no box');
        await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        const select = panelSection(window, 'Button').locator('select').first();
        await select.selectOption('outline');
        await waitForSaved(window);
        expect((await project.readPage('home')).tsx).toContain('variant="outline"');
        await expect(inner).toHaveCSS('background-color', 'rgb(0, 0, 255)');
        // The default clears the prop rather than writing it.
        await select.selectOption('default');
        await waitForSaved(window);
        expect((await project.readPage('home')).tsx).not.toContain('variant=');
        await expect(inner).toHaveCSS('background-color', 'rgb(255, 0, 0)');
    });
});
