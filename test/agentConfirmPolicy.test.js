import { describe, it, expect } from 'vitest';
import { BATCH_LIMIT, describeToolCall, needsConfirmation } from '../src/main/agent/confirmPolicy';
const edit = { name: 'scamp_set_styles', input: { element: 'card_a1b2', set: 'gap: 4px' } };
const read = { name: 'scamp_get_element_tree', input: {} };
describe('needsConfirmation', () => {
    it('always asks before a delete', () => {
        expect(needsConfirmation([{ name: 'scamp_delete_element', input: { element: 'a1b2' } }])).toBe(true);
    });
    it('asks before more edits at once than the limit', () => {
        expect(needsConfirmation(Array.from({ length: BATCH_LIMIT + 1 }, () => edit))).toBe(true);
    });
    it('lets up to the limit through without asking', () => {
        expect(needsConfirmation(Array.from({ length: BATCH_LIMIT }, () => edit))).toBe(false);
    });
    it('does not count reads toward the limit', () => {
        expect(needsConfirmation([...Array.from({ length: 10 }, () => read), edit])).toBe(false);
    });
    it('never asks for nothing', () => {
        expect(needsConfirmation([])).toBe(false);
    });
});
describe('describeToolCall', () => {
    it('says what each edit will do', () => {
        expect(describeToolCall({ name: 'scamp_delete_element', input: { element: 'card_a1b2' } })).toBe('Delete card_a1b2 and everything inside it');
        expect(describeToolCall(edit)).toBe('Change styles on card_a1b2: gap: 4px');
        expect(describeToolCall({
            name: 'scamp_set_styles',
            input: { element: 'a', set: 'gap: 1px', remove: ['padding'], breakpoint: 'Mobile' },
        })).toBe('Change styles on a at Mobile: gap: 1px; remove padding');
        expect(describeToolCall({ name: 'scamp_add_element', input: { parent: 'root', text: 'Hi', tag: 'h2' } })).toBe('Add a <h2> "Hi" to root');
        expect(describeToolCall({ name: 'scamp_set_theme_tokens', input: { tokens: { '--a': '1', '--b': '2' } } })).toBe('Add or change 2 theme tokens: --a, --b');
    });
    it('clips a long value', () => {
        const line = describeToolCall({ name: 'scamp_set_text', input: { element: 'a', text: 'x'.repeat(200) } });
        expect(line.length).toBeLessThan(110);
        expect(line).toContain('…');
    });
    it('survives input that is not an object', () => {
        expect(describeToolCall({ name: 'scamp_set_tag', input: null })).toBe('Change  to <>');
    });
});
describe('edits to another view', () => {
    it('names the view in the confirmation line', () => {
        expect(describeToolCall({ name: 'scamp_delete_element', input: { view: 'Settings', element: 'skip_c3d4' } })).toBe('Delete skip_c3d4 and everything inside it (in Settings)');
    });
    it('always asks before putting a component in place of a container', () => {
        const swap = { name: 'scamp_use_component', input: { element: 'header_a1b2', component: 'Shell', view: 'Billing' } };
        expect(needsConfirmation([swap], { planApproved: true })).toBe(true);
        expect(describeToolCall(swap)).toBe('Replace header_a1b2 with the component Shell (in Billing)');
    });
});
