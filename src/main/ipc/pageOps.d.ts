import type { PageCreateArgs, PageDeleteArgs, PageDuplicateArgs, PageFile, ProjectFormat } from '@shared/types';
export declare const PAGE_NAME_RE: RegExp;
/**
 * Resolve the on-disk paths for a page given the project format.
 * Legacy: `<root>/<page>.tsx` + `<root>/<page>.module.css`.
 * Nextjs root/home page: `<root>/app/page.tsx` + `<root>/app/page.module.css`.
 * Nextjs other pages: `<root>/app/<page>/page.tsx` + `<root>/app/<page>/page.module.css`.
 */
export declare const pagePathsFor: (projectPath: string, pageName: string, format: ProjectFormat) => {
    tsxPath: string;
    cssPath: string;
    pageDir: string | null;
};
export declare const createPage: (args: PageCreateArgs, format: ProjectFormat) => Promise<PageFile>;
export declare const deletePage: (args: PageDeleteArgs, format: ProjectFormat) => Promise<void>;
export declare const duplicatePage: (args: PageDuplicateArgs, format: ProjectFormat) => Promise<PageFile>;
