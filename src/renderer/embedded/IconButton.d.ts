import type { Icon } from '@tabler/icons-react';
type Props = {
    icon: Icon;
    /** The accessible name, also shown as the tooltip. */
    label: string;
    onClick: () => void;
    /** Set for a toggle; leave out for a plain action. */
    pressed?: boolean;
    disabled?: boolean;
    testId?: string;
    /** `bare`: the design's artboard-header icon, 22px with no box. */
    variant?: 'box' | 'bare';
};
/** A 32px icon button, as the scamp-ui Layout design draws them. */
export declare const IconButton: ({ icon: Glyph, label, onClick, pressed, disabled, testId, variant }: Props) => JSX.Element;
export {};
