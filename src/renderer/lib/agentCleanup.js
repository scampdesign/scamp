/**
 * The first message of an import cleanup.
 *
 * Carries the import report — what the importer lost or approximated —
 * because that's the cleanup's to-do list, and the agent can't read it any
 * other way: the report lives in the import window, not the view. Exact
 * changes are left out; they cost tokens and say "nothing to do".
 * see docs/plans/builtin-agent-plan.md
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
