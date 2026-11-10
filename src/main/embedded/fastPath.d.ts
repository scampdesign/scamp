import type { EmbeddedQueueItem } from '@shared/types';
/**
 * The CSS Module file and its new content, or null when the edit isn't one
 * Scamp writes itself. `read` reads a project file by its relative path.
 */
export declare const directStyleWrite: (item: EmbeddedQueueItem, read: (file: string) => Promise<string | null>) => Promise<{
    file: string;
    content: string;
} | null>;
