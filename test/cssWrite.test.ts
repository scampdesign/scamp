import { describe, it, expect, vi } from 'vitest';

import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { cssWriteFor } from '../src/renderer/src/syncBridge/cssWrite';

/**
 * A save rewrites only the rules that changed, and checks the result
 * reads back as the same design before trusting it. The check must not
 * mistake two orderings of one rule for two designs: on an agent-written
 * file every save then fell back to rewriting it whole, with a warning
 * in the project console each time.
 * see docs/plans/incremental-writes-plan.md
 */

const TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="a1b2" className={styles.row_a1b2}></div>
</div>`;

describe('cssWriteFor', () => {
  it('patches a file whose breakpoint rule lists its declarations in another order', () => {
    // As an agent wrote it: align-items before gap at Tablet.
    const base = `.root {
  width: 100%;
  position: relative;
}

.row_a1b2 {
  display: flex;
  gap: 8px;
  color: red;
}

@media (max-width: 768px) {
  .row_a1b2 {
    flex-direction: column;
    align-items: stretch;
    gap: 32px;
  }
}
`;
    // The generator's order: gap before align-items. Only the colour changed.
    const generated = `.root {
  width: 100%;
  position: relative;
}

.row_a1b2 {
  display: flex;
  gap: 8px;
  color: blue;
}

@media (max-width: 768px) {
  .row_a1b2 {
    flex-direction: column;
    gap: 32px;
    align-items: stretch;
  }
}
`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = cssWriteFor({ baseCss: base, generatedCss: generated, tsx: TSX, breakpoints: DEFAULT_BREAKPOINTS, isComponent: false });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(out.patched).toBe(true);
    expect(out.css).toContain('color: blue;');
    // The file's own order survives the patch.
    expect(out.css).toContain('align-items: stretch;\n    gap: 32px;');
  });

  it('still falls back when the patch really would read back differently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // An unparseable base can't be patched; the generated file is written whole.
    const out = cssWriteFor({ baseCss: '.row_a1b2 { color: red', generatedCss: '.row_a1b2 {\n  color: blue;\n}\n', tsx: TSX, breakpoints: DEFAULT_BREAKPOINTS, isComponent: false });
    warn.mockRestore();
    expect(out).toEqual({ css: '.row_a1b2 {\n  color: blue;\n}\n', patched: false });
  });
});
