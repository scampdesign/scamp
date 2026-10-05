import { describe, it, expect } from 'vitest';
import { backfillThemeDefaults } from '../src/shared/themeBackfill';
import {
  BROWSER_RESET_SENTINEL,
  LINK_CURSOR_SENTINEL,
  LIST_PADDING_SENTINEL,
  TABLE_RESET_SENTINEL,
  DEFAULT_BODY_FONT_FAMILY,
} from '../src/shared/agentMd';

describe('backfillThemeDefaults', () => {
  describe('--font-sans token', () => {
    it('adds the token to an existing :root rule when missing', () => {
      const input = `:root {
  --color-primary: #3b82f6;
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('--color-primary: #3b82f6');
      expect(result.content).toContain(`--font-sans: ${DEFAULT_BODY_FONT_FAMILY}`);
    });

    it("doesn't replace an existing --font-sans value", () => {
      const input = `:root {
  --font-sans: 'Inter', sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.content).toContain("--font-sans: 'Inter', sans-serif");
      expect(result.content).not.toContain(DEFAULT_BODY_FONT_FAMILY);
    });

    it('creates a :root rule when none exists and adds the token', () => {
      const input = `body {
  margin: 0;
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(':root');
      expect(result.content).toContain(`--font-sans: ${DEFAULT_BODY_FONT_FAMILY}`);
    });

    it('inserts :root after @import lines so the import-first ordering is preserved', () => {
      const input = `@import url("https://fonts.googleapis.com/css2?family=Inter");

body {
  margin: 0;
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      const importIdx = result.content.indexOf('@import');
      const rootIdx = result.content.indexOf(':root');
      expect(importIdx).toBeGreaterThanOrEqual(0);
      expect(rootIdx).toBeGreaterThan(importIdx);
    });
  });

  describe('box-sizing reset', () => {
    it('adds the universal reset when no `*` rule declares box-sizing', () => {
      const input = `:root {
  --font-sans: system-ui;
}

body {
  font-family: var(--font-sans);
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('box-sizing: border-box');
      expect(result.content).toMatch(/\*[^{]*\{[^}]*box-sizing/);
    });

    it("doesn't add the reset when the user already has * { box-sizing }", () => {
      const input = `:root {
  --font-sans: system-ui;
}

* {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}

${BROWSER_RESET_SENTINEL}
${LIST_PADDING_SENTINEL}
${LINK_CURSOR_SENTINEL}
${TABLE_RESET_SENTINEL}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(false);
      // No additional box-sizing rule was added.
      const matches = result.content.match(/box-sizing/g);
      expect(matches).toHaveLength(1);
    });

    it("doesn't add the reset when the user already has *, *::before, *::after { box-sizing }", () => {
      const input = `:root {
  --font-sans: system-ui;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}

${BROWSER_RESET_SENTINEL}
${LIST_PADDING_SENTINEL}
${LINK_CURSOR_SENTINEL}
${TABLE_RESET_SENTINEL}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(false);
    });

    it("doesn't add the reset when the user has the html + inherit pattern", () => {
      const input = `:root {
  --font-sans: system-ui;
}

html {
  box-sizing: border-box;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body {
  font-family: var(--font-sans);
}

${BROWSER_RESET_SENTINEL}
${LIST_PADDING_SENTINEL}
${LINK_CURSOR_SENTINEL}
${TABLE_RESET_SENTINEL}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(false);
    });

    it('still adds the reset when only per-class box-sizing exists (per-element overrides do not count)', () => {
      const input = `:root {
  --font-sans: system-ui;
}

.special {
  box-sizing: content-box;
}

body {
  font-family: var(--font-sans);
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      // The user's per-class override stays put.
      expect(result.content).toContain('.special');
      expect(result.content).toContain('content-box');
      // And the universal reset got appended.
      expect(result.content).toMatch(/\*[^{]*\{[^}]*box-sizing:\s*border-box/);
    });
  });

  describe('body font rule', () => {
    it('appends a body rule when no existing body { font-family } rule', () => {
      const input = `:root {
  --font-sans: system-ui;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('body');
      expect(result.content).toContain('font-family: var(--font-sans)');
    });

    it("doesn't add a body font rule when one already exists with a different family", () => {
      const input = `:root {
  --color-primary: #3b82f6;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: 'Comic Sans MS', cursive;
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(`--font-sans: ${DEFAULT_BODY_FONT_FAMILY}`);
      expect(result.content).toContain("font-family: 'Comic Sans MS', cursive");
      // Should NOT have appended a second body rule.
      const bodyMatches = result.content.match(/body\s*\{/g);
      expect(bodyMatches).toHaveLength(1);
    });
  });

  describe('browser reset block', () => {
    it('appends the reset block (with sentinel) when missing', () => {
      const input = `:root {
  --font-sans: 'Inter', sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(BROWSER_RESET_SENTINEL);
      // Spot-check a few of the reset rules made it into the output.
      expect(result.content).toContain('p,');
      expect(result.content).toContain('margin: 0');
      expect(result.content).toContain('all: unset');
      expect(result.content).toContain('display: block');
    });

    it('is a no-op when the sentinel is already present (even without the rules)', () => {
      // The sentinel is the source of truth for "Scamp's reset is
      // installed". Users can edit / extend / delete the rules
      // themselves; we only check the comment.
      const input = `:root {
  --font-sans: 'Inter', sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}

${BROWSER_RESET_SENTINEL}
${LIST_PADDING_SENTINEL}
${LINK_CURSOR_SENTINEL}
${TABLE_RESET_SENTINEL}
/* user has customised the rules, but the sentinel marks our presence */
p { margin: 8px 0; }
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(false);
      expect(result.content).toBe(input);
    });
  });

  describe('combined behaviour', () => {
    it('is a no-op when every piece is already present', () => {
      const input = `:root {
  --font-sans: 'Inter', sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}

${BROWSER_RESET_SENTINEL}
${LIST_PADDING_SENTINEL}
${LINK_CURSOR_SENTINEL}
${TABLE_RESET_SENTINEL}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(false);
      expect(result.content).toBe(input);
    });

    it('adds the list-padding reset to a project that predates it', () => {
      // The browser-reset sentinel is already there, so folding this
      // rule into that block would never have reached such a project.
      const css = `:root {\n  --font-sans: system-ui;\n}\n\n*, *::before, *::after {\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: var(--font-sans);\n}\n\n${BROWSER_RESET_SENTINEL}\n`;
      const result = backfillThemeDefaults(css);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(LIST_PADDING_SENTINEL);
      expect(result.content).toContain('padding: 0;');
    });

    it('gives a link back its pointer in a project that predates it', () => {
      // `all: unset` on `a` takes the browser's cursor with it, so an
      // element marked as a link did not behave like one under the
      // mouse. The same restoration `cursor: text` does for inputs.
      const css = `:root {\n  --font-sans: system-ui;\n}\n\n${BROWSER_RESET_SENTINEL}\n${LIST_PADDING_SENTINEL}\n`;
      const result = backfillThemeDefaults(css);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(LINK_CURSOR_SENTINEL);
      expect(result.content).toContain('cursor: pointer;');
      // An anchor with no destination is not a link, and a browser
      // does not point at one either.
      expect(result.content).toContain('a[href]');
    });

    it('undoes the browser\'s table styling in a project that predates it', () => {
      // A browser gives a table separated borders with 2px of spacing
      // and a bold, centred `th` — none of it a decision the user made,
      // and all of it arriving the moment a tag becomes `table`. Its own
      // sentinel because every existing project already carries the
      // browser-reset one.
      const css = `:root {\n  --font-sans: system-ui;\n}\n\n${BROWSER_RESET_SENTINEL}\n${LIST_PADDING_SENTINEL}\n${LINK_CURSOR_SENTINEL}\n`;
      const result = backfillThemeDefaults(css);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(TABLE_RESET_SENTINEL);
      expect(result.content).toContain('border-collapse: collapse;');
      expect(result.content).toContain('border-spacing: 0;');
      // `inherit`, not `normal`: a `th` inside a bolded row should
      // still follow it. The point is to stop the browser deciding.
      expect(result.content).toContain('font-weight: inherit;');
      expect(result.content).toContain('text-align: inherit;');
    });

    it('adds every missing piece to a bare :root file', () => {
      const input = `:root {
  --color-primary: #3b82f6;
}
`;
      const result = backfillThemeDefaults(input);
      expect(result.changed).toBe(true);
      expect(result.content).toContain(`--font-sans: ${DEFAULT_BODY_FONT_FAMILY}`);
      expect(result.content).toContain('box-sizing: border-box');
      expect(result.content).toContain('font-family: var(--font-sans)');
      expect(result.content).toContain(BROWSER_RESET_SENTINEL);
    });

    it('round-trips malformed CSS unchanged (parse-error tolerance)', () => {
      const input = `:root { --bad: ; this isn't valid;`;
      const result = backfillThemeDefaults(input);
      // Postcss is permissive — it may actually parse this. Either
      // way, the helper either no-ops (parser threw) or only adds
      // rules additively. Existing content must not be mangled.
      if (!result.changed) {
        expect(result.content).toBe(input);
      } else {
        expect(result.content).toContain('--bad');
      }
    });
  });
});
