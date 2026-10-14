/**
 * The first message of an import cleanup.
 *
 * Carries the import report — what the importer lost or approximated —
 * because that's the cleanup's to-do list, and the agent can't read it any
 * other way: the report lives in the import window, not the view. Exact
 * changes are left out; they cost tokens and say "nothing to do".
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
const MAX_LINES = 10;
export const cleanupRequest = (viewName, report) => {
    const worth = report.filter((group) => group.fidelity !== 'exact');
    const lines = worth.slice(0, MAX_LINES).map((group) => {
        const where = group.examples.length > 0 ? ` (e.g. ${group.examples.slice(0, 2).join(', ')})` : '';
        return `- ${group.fidelity}: ${group.label}${where}`;
    });
    const more = worth.length > MAX_LINES ? [`- and ${worth.length - MAX_LINES} more`] : [];
    const reported = lines.length === 0
        ? 'The importer reported nothing lost or approximated.'
        : ['The importer reported:', ...lines, ...more].join('\n');
    return `Clean up ${viewName}, the page I just imported.\n\n${reported}`;
};
/**
 * The first message of a React import tidy-up: the view, and what the
 * import kept as copies or simplified — the leftovers the source may
 * explain, like a navigation whose selected item differs by page.
 * see docs/plans/react-import-plan.md, Phase 6
 */
export const reactTidyRequest = (viewName, appName, notes) => {
    const listed = notes.slice(0, MAX_LINES).map((note) => `- ${note}`);
    const more = notes.length > MAX_LINES ? [`- and ${notes.length - MAX_LINES} more`] : [];
    const reported = listed.length === 0 ? '' : `\n\nThe import kept these as copies or simplified them:\n${[...listed, ...more].join('\n')}`;
    return `Tidy up ${viewName}, which I imported from the React app ${appName}.${reported}`;
};
