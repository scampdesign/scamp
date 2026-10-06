/**
 * `test/fixtures/react-app`, copied to a temp folder with Scamp's own
 * node_modules linked in, so the React import can run it without
 * installing anything. The caller removes the folder.
 * see docs/plans/react-import-plan.md
 */
export declare const copyFixtureApp: () => Promise<string>;
