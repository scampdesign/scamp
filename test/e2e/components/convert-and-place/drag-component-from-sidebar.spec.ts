import { test, expect } from '../../fixtures/app';
import { dragComponentToCanvas } from '../../fixtures/components';
import { measureFrame, frameToClient } from '../../fixtures/canvas';
import { pageRoot, canvasFrame } from '../../fixtures/selectors';
import { waitForSaved } from '../../fixtures/assertions';

const BUTTON_TSX = `import styles from './Button.module.css';

export default function Button() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="text_a1b2" className={styles.text_a1b2}>Click me</p>
    </div>
  );
}
`;

test.use({
  projectOptions: {
    format: 'nextjs',
    components: [{ name: 'Button', tsxContent: BUTTON_TSX }],
  },
});

test.describe('components: drag from sidebar', () => {
  test('drops an instance onto the page canvas + writes the import', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await expect(canvasFrame(window)).toBeVisible();

    // Drop at frame-local (200, 200) — clientX/Y computed via the same
    // scaling pipeline the real drop handler uses.
    const metrics = await measureFrame(window);
    const drop = frameToClient(metrics, { x: 200, y: 200 });
    await dragComponentToCanvas(window, 'Button', drop.x, drop.y);

    await waitForSaved(window);

    const { tsx: homeTsx, css: homeCss } = await project.readPage('home');
    expect(homeTsx).toContain(
      "import Button from '@/components/Button/Button';"
    );
    expect(homeTsx).toMatch(
      /<Button\s[^>]*data-scamp-instance-id="inst_[a-z0-9_]+"[^>]*\/>/
    );
    // Dropped where the pointer let go: the page records where it placed it.
    expect(homeCss).toMatch(/\.inst_[a-z0-9_]+\.inst_[a-z0-9_]+ \{[^}]*position: absolute;[^}]*left: \d+px;[^}]*top: \d+px/);
    // The component's own internal text element id MUST NOT leak onto
    // the page TSX — instances are leaves on the page side.
    expect(homeTsx).not.toContain('data-scamp-id="text_a1b2"');
  });
});
