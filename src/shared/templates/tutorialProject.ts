// The tutorial project's home view: a heading, an introduction, and two
// cards, so the lessons have something to group, reuse, and restyle.
// Written in the exact form Scamp generates. see docs/plans/onboarding-plan.md

/** The tutorial project's folder name; a taken name gets `-2`, `-3`, and so on. */
export const TUTORIAL_PROJECT_NAME = 'scamp-tutorial';

export const TUTORIAL_HOME_TSX = `import styles from './Home.module.css';

type HomeProps = {
  className?: string;
};

export default function Home({ className }: HomeProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <h1 data-scamp-id="title_a1c0" className={styles.title_a1c0}>Welcome to your tutorial</h1>
      <p data-scamp-id="intro_b2d1" className={styles.intro_b2d1}>Follow the Learn checklist on the left. Each lesson asks you to do one thing on this page.</p>
      <div data-scamp-id="card_c3e2" className={styles.card_c3e2}>
        <h2 data-scamp-id="card_title_d4f3" className={styles.card_title_d4f3}>Draw</h2>
        <p data-scamp-id="card_text_e5a4" className={styles.card_text_e5a4}>Everything you draw is a TSX and CSS file in your project folder.</p>
      </div>
      <div data-scamp-id="card_f6b5" className={styles.card_f6b5}>
        <h2 data-scamp-id="card_title_a7c6" className={styles.card_title_a7c6}>Sync</h2>
        <p data-scamp-id="card_text_b8d7" className={styles.card_text_b8d7}>Edit those files anywhere, and the canvas follows.</p>
      </div>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;

export const TUTORIAL_HOME_CSS = `.root {
  width: 100%;
  background: #f8fafc;
  position: relative;
}

.title_a1c0 {
  font-size: 40px;
  font-weight: 700;
  color: #0f172a;
  position: absolute;
  left: 80px;
  top: 80px;
}

.intro_b2d1 {
  width: 560px;
  font-size: 18px;
  color: #475569;
  position: absolute;
  left: 80px;
  top: 150px;
}

.card_c3e2 {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  border-width: 1px;
  border-style: solid;
  border-color: #e2e8f0;
  position: absolute;
  left: 80px;
  top: 240px;
}

.card_title_d4f3 {
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}

.card_text_e5a4 {
  font-size: 16px;
  color: #475569;
}

.card_f6b5 {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  border-width: 1px;
  border-style: solid;
  border-color: #e2e8f0;
  position: absolute;
  left: 440px;
  top: 240px;
}

.card_title_a7c6 {
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}

.card_text_b8d7 {
  font-size: 16px;
  color: #475569;
}
`;
