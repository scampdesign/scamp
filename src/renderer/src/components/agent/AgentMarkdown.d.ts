type Props = {
    text: string;
};
/**
 * An agent reply's Markdown, rendered. Parsed into plain data first and
 * drawn as text nodes, so nothing in a reply becomes HTML.
 * see @lib/agentMarkdown
 */
export declare const AgentMarkdown: ({ text }: Props) => JSX.Element;
export {};
