import { type ProviderKey } from '../agent/providerKey';
/** The one provider key, for the harness. */
export declare const getProviderKey: () => ProviderKey;
/** Stop every running turn: Stop, closing or switching project, and quit. */
export declare const cancelAgentTurns: () => Promise<void>;
export declare const registerAgentIpc: () => void;
