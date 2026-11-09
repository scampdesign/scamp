/** The agent's queue and controls, review of what it wrote, and git. */
type Props = {
    /** The tab stays mounted, so the agent's terminal survives a switch; this says when it's on screen. */
    active: boolean;
};
export declare const ChangesTab: ({ active }: Props) => JSX.Element;
export {};
