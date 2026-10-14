import type { DisplayMode, DisplayOuter } from '@lib/element';

import { EnumSelect } from './EnumSelect';

/** How the box sits in its parent. `block` is the field being absent. */
type DisplayChoice = 'block' | DisplayOuter;

const BLOCK_OPTIONS: ReadonlyArray<{ value: DisplayChoice; label: string }> = [
  { value: 'block', label: 'Block' },
  { value: 'inline', label: 'Inline' },
  { value: 'inline-block', label: 'Inline block' },
  { value: 'contents', label: 'Contents' },
  { value: 'list-item', label: 'List item' },
];

/** A flex or grid container is block or inline (`inline-flex`, `inline-grid`). */
const CONTAINER_OPTIONS: ReadonlyArray<{ value: DisplayChoice; label: string }> = [
  { value: 'block', label: 'Block' },
  { value: 'inline', label: 'Inline' },
];

type Props = {
  display: DisplayMode;
  outer: DisplayOuter | undefined;
  onChange: (outer: DisplayOuter | undefined) => void;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is picked. */
  mixed?: boolean;
};

/** The outer half of CSS `display`. see `displayKeyword.ts` */
export const DisplaySelect = ({ display, outer, onChange, mixed = false }: Props): JSX.Element => (
  <EnumSelect<DisplayChoice>
    mixed={mixed}
    value={outer ?? 'block'}
    options={display === 'none' ? BLOCK_OPTIONS : CONTAINER_OPTIONS}
    onChange={(value) => onChange(value === 'block' ? undefined : value)}
    title="Display — how the element sits among its neighbors: on its own line (Block), in the line of text (Inline), or with no box of its own (Contents)"
  />
);
