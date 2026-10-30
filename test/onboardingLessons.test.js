import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { LESSONS, isTutorialComplete, lessonsCompletedBy, nextLesson, } from '@lib/onboardingLessons';
const element = (fields) => ({ id: 'card_c3e2', ...fields });
const signal = (kind, extra = {}) => ({
    kind,
    elementIds: [],
    snapshot: {},
    ...extra,
});
const CORE = ['draw', 'layout', 'code', 'component', 'tokens'];
describe('lessonsCompletedBy', () => {
    it.each([
        ['draw-rect', 'draw'],
        ['group', 'layout'],
        ['external-edit', 'code'],
        ['add-component-instance', 'component'],
        ['agent-edit', 'agent'],
    ])('a %s entry completes %s', (kind, lesson) => {
        expect(lessonsCompletedBy(signal(kind), [])).toEqual([lesson]);
    });
    it('completes nothing for a page load, a move, or an unknown kind', () => {
        expect(lessonsCompletedBy(signal('load'), [])).toEqual([]);
        expect(lessonsCompletedBy(signal('move'), [])).toEqual([]);
        expect(lessonsCompletedBy(signal(''), [])).toEqual([]);
    });
    it('skips a lesson already done', () => {
        expect(lessonsCompletedBy(signal('draw-rect'), ['draw'])).toEqual([]);
    });
    it('completes tokens when a patched value references a theme token', () => {
        const patch = signal('patch', {
            elementIds: ['card_c3e2'],
            propertyKeys: ['backgroundColor'],
            snapshot: { card_c3e2: element({ backgroundColor: 'var(--color-brand-500)' }) },
        });
        expect(lessonsCompletedBy(patch, [])).toEqual(['tokens']);
    });
    it('does not complete tokens for a literal color, an unpatched token, or a missing element', () => {
        const literal = signal('patch', {
            elementIds: ['card_c3e2'],
            propertyKeys: ['backgroundColor'],
            snapshot: { card_c3e2: element({ backgroundColor: '#3b82f6' }) },
        });
        // The token was already there; this patch changed the width.
        const untouched = signal('patch', {
            elementIds: ['card_c3e2'],
            propertyKeys: ['width'],
            snapshot: { card_c3e2: element({ backgroundColor: 'var(--color-brand-500)', width: 320 }) },
        });
        const missing = signal('patch', { elementIds: ['gone_0000'], propertyKeys: ['backgroundColor'] });
        const noKeys = signal('patch', { elementIds: ['card_c3e2'], snapshot: { card_c3e2: element({ backgroundColor: 'var(--x)' }) } });
        expect(lessonsCompletedBy(literal, [])).toEqual([]);
        expect(lessonsCompletedBy(untouched, [])).toEqual([]);
        expect(lessonsCompletedBy(missing, [])).toEqual([]);
        expect(lessonsCompletedBy(noKeys, [])).toEqual([]);
    });
});
describe('nextLesson', () => {
    it('starts at the first lesson', () => {
        expect(nextLesson([])?.id).toBe('draw');
    });
    it('takes the first core lesson not done, whatever order they were done in', () => {
        expect(nextLesson(['draw', 'code'])?.id).toBe('layout');
    });
    it('offers the optional lesson after every core one, then nothing', () => {
        expect(nextLesson(CORE)?.id).toBe('agent');
        expect(nextLesson([...CORE, 'agent'])).toBeNull();
    });
});
describe('isTutorialComplete', () => {
    it('needs every core lesson, and not the optional one', () => {
        expect(isTutorialComplete(CORE)).toBe(true);
        expect(isTutorialComplete(CORE.slice(1))).toBe(false);
        expect(isTutorialComplete([])).toBe(false);
    });
});
describe('LESSONS', () => {
    it('has a unique id, steps, and a docs page for every lesson', () => {
        expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
        for (const lesson of LESSONS) {
            expect(lesson.steps.length).toBeGreaterThan(0);
            expect(lesson.docsPage).toMatch(/^[a-z-]+\.md$/);
        }
    });
    it('links each lesson to a user docs page that exists', () => {
        for (const lesson of LESSONS) {
            expect(existsSync(resolve(__dirname, '../docs/user_docs', lesson.docsPage)), lesson.docsPage).toBe(true);
        }
    });
    it('marks only the agent lesson optional', () => {
        expect(LESSONS.filter((l) => l.optional).map((l) => l.id)).toEqual(['agent']);
    });
});
