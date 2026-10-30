import { describe, it, expect } from 'vitest';

import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { TUTORIAL_HOME_CSS, TUTORIAL_HOME_TSX } from '@shared/templates/tutorialProject';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

/**
 * The tutorial project's home view is written once by the scaffold. If
 * Scamp read it back into anything else, its first save would rewrite
 * the file the user hasn't touched.
 */
describe('tutorial home view', () => {
  const parsed = parseCode(TUTORIAL_HOME_TSX, TUTORIAL_HOME_CSS, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });

  it('reproduces itself through parseCode → generateCode', () => {
    const regen = generateCode({
      elements: parsed.elements,
      rootId: parsed.rootId,
      pageName: 'Home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: parsed.customMediaBlocks,
      pageKeyframesBlocks: parsed.keyframesBlocks,
      cssModuleImportName: 'Home',
      isComponent: true,
    });
    expect(regen.tsx).toBe(TUTORIAL_HOME_TSX);
    expect(regen.css).toBe(TUTORIAL_HOME_CSS);
  });

  it('has the two sibling cards, each with a title and text, that the layout and component lessons use', () => {
    expect(parsed.elements[parsed.rootId]?.childIds).toEqual(['a1c0', 'b2d1', 'c3e2', 'f6b5']);
    expect(parsed.elements['c3e2']?.childIds).toHaveLength(2);
    expect(parsed.elements['f6b5']?.childIds).toHaveLength(2);
  });
});
