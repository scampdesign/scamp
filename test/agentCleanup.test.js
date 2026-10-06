import { describe, it, expect } from 'vitest';
import { cleanupRequest } from '@lib/agentCleanup';
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
import { nextCleanupPhase, rememberedTokenMode } from '@store/agentSlice';
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
