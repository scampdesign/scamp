import type { AgentProvider } from '../agent/provider';
import { type ProviderKey } from '../agent/providerKey';
/** The one provider key, for the harness. */
export declare const getProviderKey: () => ProviderKey;
/** Signed in, as the agent checks it: a session token, or the e2e seam. */
export declare const agentSignedIn: () => boolean;
/** Whether the agent can run now: a working key, or the e2e script in its place. */
export declare const agentConnected: () => Promise<boolean>;
/** A provider for Embedded Scamp's agent: the same key and checks as the app's. */
export declare const embeddedAgentProvider: () => Promise<AgentProvider | null>;
/** Stop every running turn: Stop, closing or switching project, and quit. */
export declare const cancelAgentTurns: () => Promise<void>;
export declare const registerAgentIpc: () => void;
