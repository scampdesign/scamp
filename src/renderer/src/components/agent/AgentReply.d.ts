import { type TranscriptEntry } from '@lib/agentTranscript';
type Props = {
    entry: Extract<TranscriptEntry, {
        role: 'assistant';
    }>;
};
/** One reply: its text and tool calls in order, then how it ended. */
export declare const AgentReply: ({ entry }: Props) => JSX.Element;
export {};
