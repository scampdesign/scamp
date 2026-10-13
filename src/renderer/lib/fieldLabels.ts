/**
 * Single source of truth for human-readable CSS-property names
 * keyed by `ScampElement` field name.
 *
 * Used by:
 *   - `Section.tsx`'s override-indicator tooltip
 *     ("Style Overrides: width, height, opacity").
 *   - `formatHistoryLabel.ts`'s `patch`-kind label
 *     ("Changed background — hero-card_a1b2").
 *
 * Multiple fields can map to the same CSS name when a single
 * concept is split across several typed fields (e.g.
 * widthMode/widthValue/widthCustom → "width"). The override
 * tooltip dedupes; the history label collapses to the first
 * matching name.
 */
export const FIELD_LABELS: Record<string, string> = {
  widthMode: 'width',
  widthValue: 'width',
  widthCustom: 'width',
  heightMode: 'height',
  heightValue: 'height',
  heightCustom: 'height',
  x: 'left',
  y: 'top',
  display: 'display',
  displayOuter: 'display',
  flexDirection: 'flex-direction',
  gap: 'gap',
  alignItems: 'align-items',
  justifyContent: 'justify-content',
  padding: 'padding',
  margin: 'margin',
  backgroundColor: 'background',
  borderRadius: 'border-radius',
  borderWidth: 'border-width',
  borderStyle: 'border-style',
  borderColor: 'border-color',
  opacity: 'opacity',
  visibilityMode: 'visibility',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  color: 'color',
  textAlign: 'text-align',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  boxShadows: 'box-shadow',
  mixBlendMode: 'mix-blend-mode',
  backgroundBlendMode: 'background-blend-mode',
  filters: 'filter',
  backdropFilters: 'backdrop-filter',
  transforms: 'transform',
  transformOrigin: 'transform-origin',
  transitions: 'transition',
  animation: 'animation',
  customProperties: 'custom CSS',
};

/** Get a human-readable name for a field, falling back to the field key itself. */
export const fieldLabel = (key: string): string =>
  FIELD_LABELS[key] ?? key;
