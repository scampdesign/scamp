import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
/**
 * Two ways an agent-written component drew differently on the canvas than
 * in the preview: a root with no background painted white, and a child
 * with no `position` under a block root was pinned at 0,0, collapsing the
 * root and swallowing the gap below it.
 */
const PROGRESS_TSX = `import styles from './Progress.module.css';

type ProgressProps = {
  className?: string;
};

export default function Progress({ className }: ProgressProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <progress data-scamp-id="bar_6d01" className={styles.bar_6d01} max="100" value="40" />
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;
const PROGRESS_CSS = `.root {
  width: 100%;
  position: relative;
}

.bar_6d01 {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  width: 100%;
  height: 12px;
  border: none;
}
`;
const HOME_TSX = `import styles from './Home.module.css';
import Progress from '@/components/Progress/Progress';

type HomeProps = {
  className?: string;
};

export default function Home({ className }: HomeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <div data-scamp-id="timeline_f109" className={styles.timeline_f109}>
        <Progress data-scamp-instance-id="inst_f205" />
        <p data-scamp-id="times_f10a" className={styles.times_f10a}>1:23</p>
      </div>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;
const HOME_CSS = `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  background: rgb(10, 120, 60);
}

.timeline_f109 {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.times_f10a {
  font-size: 12px;
}
`;
test.use({
    projectOptions: {
        format: 'scamp',
        components: [{ name: 'Progress', tsxContent: PROGRESS_TSX, cssContent: PROGRESS_CSS }],
        pageContent: { home: { tsx: HOME_TSX, css: HOME_CSS } },
    },
});
test('a component draws transparent and in flow, as in the preview', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    const instance = pageRoot(window).locator('[data-scamp-instance-id]').first();
    const bar = instance.locator('progress');
    const componentRoot = bar.locator('..');
    await expect(componentRoot).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(bar).toHaveCSS('position', 'static');
    await expect(bar).toHaveCSS('display', 'block');
    const barBox = await bar.boundingBox();
    const timesBox = await pageRoot(window).getByText('1:23').boundingBox();
    expect(barBox?.height).toBeCloseTo(12, 0);
    const gap = (timesBox?.y ?? 0) - ((barBox?.y ?? 0) + (barBox?.height ?? 0));
    expect(gap).toBeCloseTo(8, 0);
});
