import { describe, it, expect } from 'vitest';
import { cleanupRequest, reactTidyRequest } from '@lib/agentCleanup';
const group = (over) => ({
    kind: 'x',
    label: 'something',
    count: 1,
    examples: [],
    fidelity: 'approximated',
    ...over,
});
describe('cleanupRequest', () => {
    it('names the view and passes on what the importer lost or approximated', () => {
        const text = cleanupRequest('Pricing', [
            group({ fidelity: 'lost', label: '2 large images could not be fetched', examples: ['hero_0002', 'bg_0003', 'x'] }),
            group({ fidelity: 'approximated', label: '1 table rebuilt as a grid' }),
        ]);
        expect(text).toBe([
            'Clean up Pricing, the page I just imported.',
            '',
            'The importer reported:',
            '- lost: 2 large images could not be fetched (e.g. hero_0002, bg_0003)',
            '- approximated: 1 table rebuilt as a grid',
        ].join('\n'));
    });
    it('leaves out exact changes, which ask for nothing', () => {
        const text = cleanupRequest('Home', [group({ fidelity: 'exact', label: '3 wrappers removed' })]);
        expect(text).not.toContain('wrappers');
        expect(text).toContain('reported nothing lost or approximated');
    });
    it('caps a long report', () => {
        const report = Array.from({ length: 14 }, (_, i) => group({ label: `finding ${i}` }));
        const text = cleanupRequest('Home', report);
        expect(text).toContain('finding 9');
        expect(text).not.toContain('finding 10');
        expect(text).toContain('- and 4 more');
    });
    it('handles an empty report', () => {
        expect(cleanupRequest('Home', [])).toContain('reported nothing lost or approximated');
    });
});
import { nextCleanupPhase, rememberedTokenMode, skillAtWork } from '@store/agentSlice';
describe('nextCleanupPhase', () => {
    const end = (outcome) => ({
        kind: 'turn-end',
        turnId: 't',
        outcome,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    it('hands the plan to the user when the planning turn finishes', () => {
        expect(nextCleanupPhase('planning', end('done'))).toBe('awaiting-approval');
    });
    it('keeps waiting when the user asks about the plan instead of approving it', () => {
        expect(nextCleanupPhase('awaiting-approval', end('done'))).toBe('awaiting-approval');
    });
    it('ends the cleanup when the applying turn finishes', () => {
        expect(nextCleanupPhase('applying', end('done'))).toBeNull();
    });
    it('ends it when a turn does not finish, so no unwritten plan is offered', () => {
        expect(nextCleanupPhase('planning', end('cancelled'))).toBeNull();
        expect(nextCleanupPhase('planning', end('error'))).toBeNull();
    });
    it('stays out of the way outside a cleanup', () => {
        expect(nextCleanupPhase(null, end('done'))).toBeNull();
    });
});
describe('rememberedTokenMode', () => {
    it('answers null, not an error, where storage is unavailable', () => {
        expect(rememberedTokenMode('/project')).toBeNull();
    });
});
describe('reactTidyRequest', () => {
    it('names the view and the app, and lists what the import kept as copies', () => {
        expect(reactTidyRequest('Patients', 'riq_frontend', ['AppSidebar looks different on some pages'])).toBe('Tidy up Patients, which I imported from the React app riq_frontend.\n\nThe import kept these as copies or simplified them:\n- AppSidebar looks different on some pages');
    });
    it('says only what to tidy when there is nothing to list', () => {
        expect(reactTidyRequest('Home', 'app', [])).toBe('Tidy up Home, which I imported from the React app app.');
    });
    it('keeps a long list short', () => {
        const text = reactTidyRequest('Home', 'app', Array.from({ length: 14 }, (_, i) => `note ${i}`));
        expect(text).toContain('- and 4 more');
        expect(text).not.toContain('note 13');
    });
});
describe('skillAtWork', () => {
    const page = { kind: 'view', name: 'AdminAudit' };
    it('holds while this conversation’s skill plans, waits, or applies', () => {
        for (const cleanupPhase of ['planning', 'awaiting-approval', 'applying']) {
            expect(skillAtWork({ cleanupPhase, cleanupConversation: page }, page)).toBe(true);
        }
    });
    it('is over when nothing is under way, or the work is another conversation’s', () => {
        expect(skillAtWork({ cleanupPhase: null, cleanupConversation: page }, page)).toBe(false);
        expect(skillAtWork({ cleanupPhase: 'awaiting-approval', cleanupConversation: page }, { kind: 'view', name: 'Billing' })).toBe(false);
    });
});
