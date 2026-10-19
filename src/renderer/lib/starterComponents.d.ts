/**
 * Starter components a user can add from the Components sidebar, to reuse
 * or to learn variants from: a Button with `variant` and `size` axes, and
 * a Modal and a Menu with a `state` axis a route opens and closes.
 * Each is written in Scamp's own canonical form, so adding one causes no
 * rewrite on load. see docs/plans/component-variants-plan.md
 */
export type StarterName = 'Button' | 'Modal' | 'Menu';
export declare const STARTERS: ReadonlyArray<{
    name: StarterName;
    description: string;
}>;
/** The starter's files, renamed: the name is in the import, the props type, and the function. */
export declare const starterFiles: (starter: StarterName, componentName: string) => {
    tsx: string;
    css: string;
};
/** `Button`, or `Button2`, `Button3`, … when taken. Case-insensitive, as a macOS disk is. */
export declare const freeStarterName: (starter: StarterName, existing: ReadonlyArray<string>) => string;
