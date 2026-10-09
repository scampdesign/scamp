/**
 * The parity corpus.
 *
 * Each fixture is the TSX + CSS a page would have on disk, plus the same
 * markup written out as plain HTML. The canvas parses the TSX/CSS and
 * renders; a browser renders the HTML against the identical CSS. Any
 * geometry difference between them is a canvas/preview divergence.
 *
 * Hand-written rather than produced by `generateCode`, deliberately —
 * these should look like what a person or an agent writes, which is where
 * the divergences have actually come from.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */
const page = (body) => `import styles from './home.module.css';

export default function Home() {
  return (
${body}
  );
}
`;
export const PARITY_FIXTURES = [
    {
        name: 'flex-row-stretch-with-sized-sibling',
        why: 'The design-podcast hero. A `width: 100%` child beside a fixed-width sibling: `flex: 1` (basis 0) would give it only the leftovers, `width: 100%` shrinks it proportionally.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="hero_a001" className={styles.hero_a001}>
        <div data-scamp-id="glow_a002" className={styles.glow_a002} />
        <div data-scamp-id="inner_a003" className={styles.inner_a003}>
          <p data-scamp-id="text_a004" className={styles.text_a004}>Hero copy</p>
        </div>
      </div>
    </div>`),
        html: `    <div class="root">
      <div class="hero_a001">
        <div class="glow_a002"></div>
        <div class="inner_a003">
          <p class="text_a004">Hero copy</p>
        </div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
  background: #101014;
}

.hero_a001 {
  width: 100%;
  display: flex;
  justify-content: center;
  position: relative;
}

.glow_a002 {
  width: 480px;
  height: 200px;
  background: #222230;
}

.inner_a003 {
  width: 100%;
  max-width: 600px;
  display: flex;
  background: #303048;
}

.text_a004 {
  width: 200px;
  color: #ffffff;
}
`,
    },
    {
        name: 'flex-column-cross-axis-max-width-centred',
        why: 'A centred, clamped child in a column parent. Substituting `align-self: stretch` would override the parent `align-items` and pin it left.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="col_b001" className={styles.col_b001}>
        <div data-scamp-id="card_b002" className={styles.card_b002} />
      </div>
    </div>`),
        html: `    <div class="root">
      <div class="col_b001">
        <div class="card_b002"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.col_b001 {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.card_b002 {
  width: 100%;
  max-width: 320px;
  height: 120px;
  background: #445566;
}
`,
    },
    {
        name: 'absolute-child-in-flex-parent',
        why: 'A decorative layer taken out of flow inside a flex row. If `position: absolute` is lost, it re-enters flow and displaces its siblings.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="row_c001" className={styles.row_c001}>
        <div data-scamp-id="layer_c002" className={styles.layer_c002} />
        <div data-scamp-id="body_c003" className={styles.body_c003} />
      </div>
    </div>`),
        html: `    <div class="root">
      <div class="row_c001">
        <div class="layer_c002"></div>
        <div class="body_c003"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.row_c001 {
  width: 100%;
  display: flex;
  position: relative;
}

.layer_c002 {
  width: 400px;
  height: 300px;
  position: absolute;
  left: 0px;
  top: 0px;
  background: #2a2a40;
}

.body_c003 {
  width: 100%;
  height: 160px;
  background: #556677;
}
`,
    },
    {
        name: 'transform-rotate-translate-origin',
        why: 'Typed transforms leave the inline layer for the stylesheet. A rotated box and a translated one change their painted bounding boxes without touching layout — the untransformed sibling must not move, and the rotated box must pivot around the origin the CSS names, not the centre.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="row_t001" className={styles.row_t001}>
        <div data-scamp-id="spun_t002" className={styles.spun_t002} />
        <div data-scamp-id="moved_t003" className={styles.moved_t003} />
        <div data-scamp-id="still_t004" className={styles.still_t004} />
      </div>
    </div>`),
        html: `    <div class="root">
      <div class="row_t001">
        <div class="spun_t002"></div>
        <div class="moved_t003"></div>
        <div class="still_t004"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.row_t001 {
  width: 100%;
  display: flex;
  gap: 40px;
  padding: 60px;
}

.spun_t002 {
  width: 120px;
  height: 80px;
  background: #445566;
  transform: rotate(30deg);
  transform-origin: top left;
}

.moved_t003 {
  width: 120px;
  height: 80px;
  background: #667788;
  transform: translate(24px, -16px) scale(1.25);
}

.still_t004 {
  width: 120px;
  height: 80px;
  background: #8899aa;
}
`,
    },
    {
        name: 'nested-flex-with-gap-and-padding',
        why: 'Plain layout sanity: gap, padding, borders and nesting all resolving the same on both sides. The border is here for its layout effect — it offsets children and, under border-box, reduces the content width.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="outer_d001" className={styles.outer_d001}>
        <div data-scamp-id="a_d002" className={styles.a_d002} />
        <div data-scamp-id="b_d003" className={styles.b_d003} />
        <div data-scamp-id="c_d004" className={styles.c_d004} />
      </div>
    </div>`),
        html: `    <div class="root">
      <div class="outer_d001">
        <div class="a_d002"></div>
        <div class="b_d003"></div>
        <div class="c_d004"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.outer_d001 {
  width: 100%;
  display: flex;
  gap: 16px;
  padding: 24px;
  align-items: flex-start;
  position: relative;
  /* A border shifts every child inward and, under border-box, eats into
     the content width — so it belongs in a geometry fixture, not only in
     the painted one. */
  border-width: 6px;
  border-style: solid;
  border-color: #778899;
  border-radius: 12px;
}

.a_d002 {
  width: 120px;
  height: 80px;
  background: #334455;
}

.b_d003 {
  width: 100%;
  height: 120px;
  background: #445566;
}

.c_d004 {
  width: 60px;
  height: 40px;
  background: #556677;
}
`,
    },
    {
        name: 'grid-two-columns',
        why: 'Grid tracks and gaps, which the canvas re-derives the same way it does flex.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="grid_e001" className={styles.grid_e001}>
        <div data-scamp-id="cell_e002" className={styles.cell_e002} />
        <div data-scamp-id="cell_e003" className={styles.cell_e003} />
      </div>
    </div>`),
        html: `    <div class="root">
      <div class="grid_e001">
        <div class="cell_e002"></div>
        <div class="cell_e003"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.grid_e001 {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 20px;
  position: relative;
}

.cell_e002 {
  height: 100px;
  background: #334455;
}

.cell_e003 {
  height: 100px;
  background: #445566;
}
`,
    },
    {
        name: 'pseudo-element-before-content',
        why: 'A `::before` badge, which agent.md actively recommends. It occupies real layout space in the browser.',
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="badge_f001" className={styles.badge_f001} />
    </div>`),
        html: `    <div class="root">
      <div class="badge_f001"></div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.badge_f001 {
  width: fit-content;
  height: fit-content;
  display: flex;
  background: #334455;
}

.badge_f001::before {
  content: "NEW";
  display: block;
  width: 120px;
  height: 40px;
  background: #ff0000;
}
`,
    },
    {
        name: 'text-tag-holding-children-and-inline-markup',
        why: "A `<p>` holding two element children and a `<strong>` mid-sentence — the shape every website import produces. The canvas rendered a text element's `text` and dropped its children, so both were listed in the layers panel and drew nothing. Sizes are pinned because the two Chromium builds resolve `system-ui` differently; what is being checked is that the children exist, sit in order, and honour `display: block` on tags a browser lays out inline.",
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="box_e001" className={styles.box_e001}>
        <span data-scamp-id="label_e002" className={styles.label_e002}>one</span>
        <em data-scamp-id="italic_e003" className={styles.italic_e003}>two</em>
        <strong>three</strong>
      </p>
    </div>`),
        html: `    <div class="root">
      <p class="box_e001">
        <span class="label_e002">one</span>
        <em class="italic_e003">two</em>
        <strong>three</strong>
      </p>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.box_e001 {
  width: 400px;
  height: 160px;
  position: absolute;
  left: 0px;
  top: 0px;
}

.label_e002 {
  width: 200px;
  height: 40px;
  display: block;
  position: static;
  background: #334455;
}

.italic_e003 {
  width: 300px;
  height: 30px;
  display: block;
  margin: 8px 0px 0px;
  position: static;
  background: #556677;
}
`,
    },
    {
        name: 'component-instance-isolation',
        why: "Two instances of one component beside a page that also names its root `root`. The page's rules must not reach inside an instance, and each instance must get its own copy of the component's rules — what CSS Modules do on disk. The component's `::before` is the part inline styles cannot express, so it only renders once the component's stylesheet reaches the canvas.",
        components: [
            {
                name: 'Card',
                tsx: `import styles from './Card.module.css';

type CardProps = { className?: string };

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <div data-scamp-id="fill_c001" className={styles.fill_c001} />
    </div>
  );
}
`,
                css: `.root {
  width: 200px;
  height: 80px;
  display: flex;
  padding: 10px;
  background: #445566;
}

.root::before {
  content: "";
  display: block;
  width: 30px;
  height: 30px;
  background: #ff0000;
}

.fill_c001 {
  width: 100%;
  height: 100%;
  background: #99aabb;
}
`,
            },
        ],
        tsx: `import styles from './home.module.css';
import Card from '@/components/Card/Card';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Card data-scamp-instance-id="inst_a024" />
      <Card data-scamp-instance-id="inst_b135" />
    </div>
  );
}
`,
        html: `    <div data-scamp-id="root" class="root">
      <div data-scamp-instance-id="inst_a024" data-scamp-id="root" class="Card_root">
        <div data-scamp-id="fill_c001" class="Card_fill_c001"></div>
      </div>
      <div data-scamp-instance-id="inst_b135" data-scamp-id="root" class="Card_root">
        <div data-scamp-id="fill_c001" class="Card_fill_c001"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  gap: 24px;
  padding: 40px;
  position: relative;
  background: #101014;
}
`,
        truthCss: `.Card_root {
  width: 200px;
  height: 80px;
  display: flex;
  padding: 10px;
  background: #445566;
}

.Card_root::before {
  content: "";
  display: block;
  width: 30px;
  height: 30px;
  background: #ff0000;
}

.Card_fill_c001 {
  width: 100%;
  height: 100%;
  background: #99aabb;
}
`,
    },
    {
        name: 'painted-surfaces',
        why: 'Gradients, shadows, filters, blend modes, radii and alpha — everything that produces identical geometry and therefore slips past a geometry-only check. The radial gradient here is the exact shape of the bug that rendered in the preview and not on the canvas.',
        pixels: true,
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="grad_g001" className={styles.grad_g001} />
      <div data-scamp-id="linear_g002" className={styles.linear_g002} />
      <div data-scamp-id="shadow_g003" className={styles.shadow_g003} />
      <div data-scamp-id="filtered_g004" className={styles.filtered_g004} />
      <div data-scamp-id="blended_g005" className={styles.blended_g005} />
    </div>`),
        html: `    <div class="root">
      <div class="grad_g001"></div>
      <div class="linear_g002"></div>
      <div class="shadow_g003"></div>
      <div class="filtered_g004"></div>
      <div class="blended_g005"></div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 20px;
  align-items: flex-start;
  position: relative;
  background: #101014;
}

.grad_g001 {
  width: 120px;
  height: 120px;
  background: radial-gradient(circle 60px at 50% 50%, rgba(160, 140, 255, 0.9) 0%, rgba(94, 200, 245, 0.4) 45%, rgba(7, 6, 15, 0) 70%);
}

.linear_g002 {
  width: 120px;
  height: 120px;
  background: linear-gradient(135deg, #ff5f6d 0%, #ffc371 100%);
  border-radius: 24px;
}

.shadow_g003 {
  width: 120px;
  height: 120px;
  background: #445566;
  border-radius: 50%;
  border-width: 4px;
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0px 12px 32px 0px rgba(160, 140, 255, 0.7);
}

.filtered_g004 {
  width: 120px;
  height: 120px;
  background: linear-gradient(90deg, #22c55e 0%, #3b82f6 100%);
  filter: blur(6px) saturate(180%);
}

.blended_g005 {
  width: 120px;
  height: 120px;
  background: #ff5f6d;
  mix-blend-mode: difference;
}
`,
    },
    {
        name: 'typography',
        why: 'Font, size, weight, colour, alignment, line height and letter spacing. Invisible to geometry, and unreliable in pixels because the two Chromium builds resolve fonts differently — so this fixture is checked on computed values instead.',
        computed: [
            'font-family',
            'font-size',
            'font-weight',
            'color',
            'text-align',
            'line-height',
            'letter-spacing',
        ],
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <p data-scamp-id="head_t001" className={styles.head_t001}>Heading text</p>
      <p data-scamp-id="body_t002" className={styles.body_t002}>Body copy here</p>
      <p data-scamp-id="token_t003" className={styles.token_t003}>Token driven</p>
    </div>`),
        html: `    <div class="root">
      <p class="head_t001">Heading text</p>
      <p class="body_t002">Body copy here</p>
      <p class="token_t003">Token driven</p>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.head_t001 {
  width: 400px;
  font-family: Georgia, serif;
  font-size: 32px;
  font-weight: 700;
  color: #ff3366;
  text-align: center;
  line-height: 40px;
  letter-spacing: 2px;
}

.body_t002 {
  width: 400px;
  font-size: 14px;
  font-weight: 400;
  color: rgba(20, 30, 40, 0.8);
  text-align: right;
  line-height: 1.6;
}

.token_t003 {
  width: 400px;
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  color: var(--color-primary);
  /* Explicit, because a normal line-height comes from the matched font and
     the two engines resolve system-ui differently - a fixture artefact,
     not a divergence. see docs/notes/parity-harness.md */
  line-height: 24px;
}
`,
    },
    {
        name: 'binding-repeat-and-show',
        why: 'A component whose list repeats over its sample rows and whose notes show or hide by a sample flag. The canvas must render one copy per row with the row in scope, keep the shown note, and drop the hidden one — what the framework renders from the same defaults. see docs/notes/view-bindings.md',
        components: [
            {
                name: 'List',
                tsx: `import styles from './List.module.css';

type ListProps = {
  items?: Array<{ id: string; label: string }>;
  extra?: boolean;
  more?: boolean;
  className?: string;
};

export default function List({
  items = [
    { id: "1", label: "Alpha" },
    { id: "2", label: "Beta" },
    { id: "3", label: "Gamma" },
  ],
  extra = true,
  more = false,
  className,
}: ListProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      {items.map((item) => (
        <div data-scamp-id="row_r001" className={styles.row_r001} key={item.id}>
          <p data-scamp-id="label_r002" className={styles.label_r002}>{item.label}</p>
        </div>
      ))}
      {extra && (
        <div data-scamp-id="note_r003" className={styles.note_r003} />
      )}
      {more && (
        <div data-scamp-id="hidden_r004" className={styles.hidden_r004} />
      )}
    </div>
  );
}

export const _scamp = { contract: 0, events: [] } as const;
`,
                css: `.root {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: #223344;
}

.row_r001 {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 8px;
  background: #556677;
}

.label_r002 {
  width: 100px;
  font-size: 16px;
  line-height: 24px;
  margin: 0;
}

.note_r003 {
  height: 20px;
  background: #66aa66;
}

.hidden_r004 {
  height: 20px;
  background: #aa6666;
}
`,
            },
        ],
        tsx: `import styles from './home.module.css';
import List from '@/components/List/List';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <List data-scamp-instance-id="inst_a024" />
    </div>
  );
}
`,
        html: `    <div data-scamp-id="root" class="root">
      <div data-scamp-instance-id="inst_a024" data-scamp-id="root" class="List_root">
        <div data-scamp-id="row_r001" class="List_row_r001"><p data-scamp-id="label_r002" class="List_label_r002">Alpha</p></div>
        <div data-scamp-id="row_r001" class="List_row_r001"><p data-scamp-id="label_r002" class="List_label_r002">Beta</p></div>
        <div data-scamp-id="row_r001" class="List_row_r001"><p data-scamp-id="label_r002" class="List_label_r002">Gamma</p></div>
        <div data-scamp-id="note_r003" class="List_note_r003"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  padding: 40px;
  position: relative;
  background: #101014;
}
`,
        truthCss: `.List_root {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: #223344;
}

.List_row_r001 {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 8px;
  background: #556677;
}

.List_label_r002 {
  width: 100px;
  font-size: 16px;
  line-height: 24px;
  margin: 0;
}

.List_note_r003 {
  height: 20px;
  background: #66aa66;
}
`,
    },
    {
        name: 'table-rows-and-cells',
        why: "A table's row and cell styling is derived into :where() rules the canvas only sees through the injected sheet. An inline `background-color: transparent` on every canvas row hid the stripe while the preview showed it, and a zero-specificity cell rule lost its padding to the table reset. Empty fixed-height cells keep fonts out of it.",
        computed: [
            'background-color',
            'border-bottom-width',
            'border-bottom-style',
            'padding-top',
            'padding-left',
            'text-align',
        ],
        tsx: page(`    <div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="table_t101" className={styles.table_t101}>
        <tbody data-scamp-id="body_t102" className={styles.body_t102}>
          <tr data-scamp-id="row_t103" className={styles.row_t103}>
            <td data-scamp-id="cell_t104" className={styles.cell_t104} />
            <td data-scamp-id="cell_t105" className={styles.cell_t105} />
          </tr>
          <tr data-scamp-id="row_t106" className={styles.row_t106}>
            <td data-scamp-id="cell_t107" className={styles.cell_t107} />
            <td data-scamp-id="cell_t108" className={styles.cell_t108} />
          </tr>
        </tbody>
      </table>
    </div>`),
        html: `    <div class="root">
      <table class="table_t101">
        <tbody class="body_t102">
          <tr class="row_t103">
            <td class="cell_t104"></td>
            <td class="cell_t105"></td>
          </tr>
          <tr class="row_t106">
            <td class="cell_t107"></td>
            <td class="cell_t108"></td>
          </tr>
        </tbody>
      </table>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  padding: 20px;
  align-items: flex-start;
  position: relative;
  background: #ffffff;
}

.table_t101 {
  width: 300px;
  display: grid;
  grid-template-columns: 2fr 1fr;
}

:where(.table_t101) > :where(thead, tbody, tfoot),
:where(.table_t101) :where(tr) {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
}

.table_t101 :where(th, td) {
  padding: 4px 10px;
  text-align: center;
}

:where(.table_t101) :where(tr) {
  border-bottom: 2px solid #cc3344;
}

:where(.table_t101) > :where(tbody) > :where(tr:nth-child(even)),
:where(.table_t101) > :where(tr:nth-child(even of tr)) {
  background-color: #dde4ff;
}

.cell_t104 {
  height: 20px;
}

.cell_t105 {
  height: 20px;
  padding: 2px;
}

.cell_t107 {
  height: 20px;
}

.cell_t108 {
  height: 20px;
}
`,
    },
    {
        name: 'component-root-fills-grid-row',
        why: "An imported app shell: a sidebar component beside the page content in a grid row. The sidebar's root is `height: 100%` with its own background, so in a browser it fills the row the taller content sets. The canvas wraps an instance in boxes the page doesn't have, and a content-sized one stopped the percentage — the sidebar's background ended where its links did.",
        components: [
            {
                name: 'Side',
                tsx: `import styles from './Side.module.css';

type SideProps = { className?: string };

export default function Side({ className }: SideProps) {
  return (
    <nav data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <div data-scamp-id="link_s001" className={styles.link_s001} />
    </nav>
  );
}
`,
                css: `.root {
  width: 120px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #445566;
}

.link_s001 {
  width: 100%;
  height: 40px;
  background: #99aabb;
}
`,
            },
        ],
        tsx: `import styles from './home.module.css';
import Side from '@/components/Side/Side';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="shell_a001" className={styles.shell_a001}>
        <Side data-scamp-instance-id="inst_s1d3" />
        <div data-scamp-id="main_a002" className={styles.main_a002} />
      </div>
    </div>
  );
}
`,
        html: `    <div data-scamp-id="root" class="root">
      <div data-scamp-id="shell_a001" class="shell_a001">
        <nav data-scamp-instance-id="inst_s1d3" data-scamp-id="root" class="Side_root">
          <div data-scamp-id="link_s001" class="Side_link_s001"></div>
        </nav>
        <div data-scamp-id="main_a002" class="main_a002"></div>
      </div>
    </div>`,
        css: `.root {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.shell_a001 {
  width: 100%;
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
}

.main_a002 {
  height: 400px;
  background: #ddeeff;
}
`,
        truthCss: `.Side_root {
  width: 120px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #445566;
}

.Side_link_s001 {
  width: 100%;
  height: 40px;
  background: #99aabb;
}
`,
    },
];
