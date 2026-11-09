type Props = {
    /** Always mounted, so the agent's terminal survives a switch of tabs. */
    active: boolean;
};
/** Everything about the agent: who it is and how it connects, what it's working on, and design checks. */
export declare const AgentTab: ({ active }: Props) => JSX.Element;
export {};
