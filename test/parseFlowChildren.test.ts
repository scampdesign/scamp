import { describe, it, expect } from 'vitest';
import { parseCode } from '@lib/parseCode';
import { generateCode } from '@lib/generateCode';

/**
 * A child of a block parent with no `position` is in normal flow in the
 * browser. Parsed as Scamp's `auto` it drew at 0,0 on the canvas and was
 * written back as `position: absolute`.
 *
 * see docs/notes/parse-flow-children.md
 */

const page = (childTag: string, css: string, parentTag = 'div'): { tsx: string; css: string } => ({
  tsx: `import styles from './page.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <${parentTag} data-scamp-id="box_a1b2" className={styles.box_a1b2}>
        <${childTag} data-scamp-id="bar_c3d4" className={styles.bar_c3d4} />
      </${parentTag}>
    </div>
  );
}
`,
  css,
});

const parseBar = (childTag: string, css: string) => {
  const src = page(childTag, css);
  const parsed = parseCode(src.tsx, src.css);
  return { parsed, bar: parsed.elements['c3d4'] };
};

const regenerate = (childTag: string, css: string): string => {
  const { parsed } = parseBar(childTag, css);
  const out = generateCode({
    elements: parsed.elements,
    rootId: parsed.rootId,
    pageName: 'home',
    cssModuleImportName: 'page',
  });
  return out.css.match(/\.bar_c3d4\s*\{[^}]*\}/s)?.[0] ?? '';
};

const BLOCK_PARENT = `.root { width: 100%; }
.box_a1b2 { width: 100%; }
.bar_c3d4 { display: block; width: 100%; height: 12px; }
`;

describe('a child with no position under a block parent', () => {
  it('parses as static', () => {
    expect(parseBar('progress', BLOCK_PARENT).bar?.position).toBe('static');
  });

  it('keeps a progress bar block-level and in flow on save', () => {
    const css = regenerate('progress', BLOCK_PARENT);
    expect(css).toContain('display: block;');
    expect(css).toContain('position: static;');
    expect(css).not.toContain('absolute');
  });

  it('parses a div with no display as static too', () => {
    const css = BLOCK_PARENT.replace('display: block; ', '');
    expect(parseBar('div', css).bar?.position).toBe('static');
  });

  it('leaves an inline span with no display as auto', () => {
    const css = BLOCK_PARENT.replace('display: block; ', '');
    expect(parseBar('span', css).bar?.position).toBe('auto');
  });

  it('parses a span that declares its display as static', () => {
    expect(parseBar('span', BLOCK_PARENT).bar?.position).toBe('static');
  });

  it('keeps a declared position', () => {
    const css = BLOCK_PARENT.replace('height: 12px;', 'height: 12px; position: absolute; left: 4px; top: 8px;');
    expect(parseBar('div', css).bar?.position).toBe('auto');
  });

  it('leaves a flex child as auto', () => {
    const css = BLOCK_PARENT.replace('.box_a1b2 { width: 100%; }', '.box_a1b2 { display: flex; }');
    expect(parseBar('div', css).bar?.position).toBe('auto');
  });

  it('round-trips text-stable after the first save', () => {
    const once = regenerate('progress', BLOCK_PARENT);
    const twice = regenerate('progress', BLOCK_PARENT.replace(/\.bar_c3d4 \{[^}]*\}/, once));
    expect(twice).toBe(once);
  });
});
