import type { EmbeddedIdiom } from '@shared/types';

/**
 * How a project writes its styles, so the agent edits in the same idiom.
 * Read from its dependencies and file names, never from guesses about
 * content; more than one can hold (Tailwind beside a few modules).
 * see docs/plans/embedded-scamp-plan.md
 */

const TAILWIND_DEPS = ['tailwindcss', '@tailwindcss/vite', '@tailwindcss/postcss'];
const STYLED_DEPS = ['styled-components', '@emotion/styled', '@emotion/react'];

export const detectIdioms = (
  dependencies: ReadonlyArray<string>,
  files: ReadonlyArray<string>
): EmbeddedIdiom[] => {
  const deps = new Set(dependencies);
  const out: EmbeddedIdiom[] = [];
  if (TAILWIND_DEPS.some((d) => deps.has(d)) || files.some((f) => /(^|\/)tailwind\.config\.[cm]?[jt]s$/.test(f))) {
    out.push('tailwind');
  }
  if (files.some((f) => /\.module\.(css|scss|sass|less)$/.test(f))) out.push('css-modules');
  if (STYLED_DEPS.some((d) => deps.has(d))) out.push('styled-components');
  const plain = files.some((f) => /\.(css|scss|sass|less)$/.test(f) && !/\.module\.(css|scss|sass|less)$/.test(f));
  if (plain || out.length === 0) out.push('plain-css');
  return out;
};

/** The idioms, as the agent's instructions name them. */
export const describeIdioms = (idioms: ReadonlyArray<EmbeddedIdiom>): string => {
  const names: Record<EmbeddedIdiom, string> = {
    tailwind: 'Tailwind utility classes in the JSX `className`',
    'css-modules': 'CSS Modules (`*.module.css` imported as `styles`)',
    'styled-components': 'styled-components / Emotion (styles in tagged templates or `styled()` calls)',
    'plain-css': 'plain CSS files with class selectors',
  };
  return idioms.map((i) => names[i]).join('; ');
};
