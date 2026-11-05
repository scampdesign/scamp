import type { ScampEmbeddedApi } from '../../preload/embedded';

declare global {
  interface Window {
    scampEmbedded: ScampEmbeddedApi;
  }
}

export {};
