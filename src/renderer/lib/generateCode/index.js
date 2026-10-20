import { generateCss } from "./css";
import { generateTsx } from "./tsx";
import { withInteractionAttributes } from "../variantInteractions";
export const generateCode = (args) => {
    return {
        tsx: generateTsx(
        // Click, outside, and Escape interactions are attributes in the TSX.
        withInteractionAttributes(args.elements), args.rootId, args.pageName, args.cssModuleImportName ?? args.pageName, args.isComponent === true),
        css: generateCss(args.elements, args.rootId, args.breakpoints ?? [], args.customMediaBlocks ?? [], args.pageKeyframesBlocks ?? []),
    };
};
