import { describe, it, expect } from 'vitest';
import { addGroup, groupNameError, groupOf, groupPages, insertPageAfter, movePageToGroup, moveRow, moveTargets, nextGroupName, pagesBetween, reconcileLayout, removeGroup, removePage, renameGroup, renamePage, } from '@lib/pageLayout';
const LAYOUT = [
    { page: 'home' },
    { group: 'Marketing', pages: ['about', 'pricing'] },
    { page: 'blog' },
    { group: 'Account', pages: ['login'] },
];
describe('reconcileLayout', () => {
    it('gives today’s order when the project never grouped: Home first, then by slug', () => {
        expect(reconcileLayout(['pricing', 'about', 'home', 'blog'], undefined)).toEqual([
            { page: 'home' },
            { page: 'about' },
            { page: 'blog' },
            { page: 'pricing' },
        ]);
    });
    it('keeps the stored order and groups', () => {
        expect(reconcileLayout(['home', 'about', 'pricing', 'blog', 'login'], LAYOUT)).toEqual(LAYOUT);
    });
    it('adds pages the layout doesn’t name at the end of the top level, by slug', () => {
        const out = reconcileLayout(['home', 'about', 'pricing', 'blog', 'login', 'zeta', 'faq'], LAYOUT);
        expect(out.slice(-2)).toEqual([{ page: 'faq' }, { page: 'zeta' }]);
    });
    it('drops pages that no longer exist, and keeps a group they leave empty', () => {
        expect(reconcileLayout(['home', 'blog'], LAYOUT)).toEqual([
            { page: 'home' },
            { group: 'Marketing', pages: [] },
            { page: 'blog' },
            { group: 'Account', pages: [] },
        ]);
    });
    it('shows a page once even if the layout names it twice', () => {
        const doubled = [{ page: 'home' }, { group: 'G', pages: ['home'] }];
        expect(reconcileLayout(['home'], doubled)).toEqual([{ page: 'home' }, { group: 'G', pages: [] }]);
    });
    it('returns an empty list for a project with no pages', () => {
        expect(reconcileLayout([], undefined)).toEqual([]);
    });
});
describe('moveRow — pages', () => {
    it('moves a page into a group, at its end', () => {
        const out = moveRow(LAYOUT, { kind: 'page', slug: 'blog' }, { kind: 'group', name: 'Marketing' }, 'inside');
        expect(out).toEqual([
            { page: 'home' },
            { group: 'Marketing', pages: ['about', 'pricing', 'blog'] },
            { group: 'Account', pages: ['login'] },
        ]);
    });
    it('moves a page out of a group to the top level, next to a group', () => {
        const out = moveRow(LAYOUT, { kind: 'page', slug: 'about' }, { kind: 'group', name: 'Marketing' }, 'before');
        expect(out.slice(0, 3)).toEqual([{ page: 'home' }, { page: 'about' }, { group: 'Marketing', pages: ['pricing'] }]);
    });
    it('moves a page between groups, next to a page in the other group', () => {
        const out = moveRow(LAYOUT, { kind: 'page', slug: 'pricing' }, { kind: 'page', slug: 'login' }, 'before');
        expect(groupOf(out, 'pricing')).toBe('Account');
        expect(out[3]).toEqual({ group: 'Account', pages: ['pricing', 'login'] });
    });
    it('reorders within a group', () => {
        const out = moveRow(LAYOUT, { kind: 'page', slug: 'about' }, { kind: 'page', slug: 'pricing' }, 'after');
        expect(out[1]).toEqual({ group: 'Marketing', pages: ['pricing', 'about'] });
    });
    it('reorders at the top level, Home included', () => {
        const out = moveRow(LAYOUT, { kind: 'page', slug: 'home' }, { kind: 'page', slug: 'blog' }, 'after');
        expect(out.map((e) => ('page' in e ? e.page : e.group))).toEqual(['Marketing', 'blog', 'home', 'Account']);
    });
    it('does nothing for a drop on itself, an unknown page, or an unknown target', () => {
        expect(moveRow(LAYOUT, { kind: 'page', slug: 'blog' }, { kind: 'page', slug: 'blog' }, 'after')).toEqual(LAYOUT);
        expect(moveRow(LAYOUT, { kind: 'page', slug: 'nope' }, { kind: 'page', slug: 'blog' }, 'after')).toEqual(LAYOUT);
        expect(moveRow(LAYOUT, { kind: 'page', slug: 'blog' }, { kind: 'page', slug: 'nope' }, 'after')).toEqual(LAYOUT);
        expect(moveRow(LAYOUT, { kind: 'page', slug: 'blog' }, { kind: 'group', name: 'Nope' }, 'inside')).toEqual(LAYOUT);
    });
});
describe('moveRow — groups', () => {
    it('reorders groups among the top-level rows', () => {
        const out = moveRow(LAYOUT, { kind: 'group', name: 'Account' }, { kind: 'page', slug: 'home' }, 'before');
        expect(out.map((e) => ('page' in e ? e.page : e.group))).toEqual(['Account', 'home', 'Marketing', 'blog']);
    });
    it('dropped on a grouped page, goes next to that page’s group — groups don’t nest', () => {
        const out = moveRow(LAYOUT, { kind: 'group', name: 'Account' }, { kind: 'page', slug: 'about' }, 'inside');
        expect(out.map((e) => ('page' in e ? e.page : e.group))).toEqual(['home', 'Marketing', 'Account', 'blog']);
        expect(out[2]).toEqual({ group: 'Account', pages: ['login'] });
    });
    it('does nothing when dropped onto itself or one of its own pages', () => {
        expect(moveRow(LAYOUT, { kind: 'group', name: 'Marketing' }, { kind: 'page', slug: 'about' }, 'after')).toEqual(LAYOUT);
        expect(moveRow(LAYOUT, { kind: 'group', name: 'Marketing' }, { kind: 'group', name: 'Marketing' }, 'before')).toEqual(LAYOUT);
    });
});
describe('page operations', () => {
    it('a rename keeps the page in its group and position', () => {
        expect(renamePage(LAYOUT, 'about', 'company')[1]).toEqual({ group: 'Marketing', pages: ['company', 'pricing'] });
    });
    it('removes a page from wherever it is', () => {
        expect(removePage(LAYOUT, 'pricing')[1]).toEqual({ group: 'Marketing', pages: ['about'] });
        expect(removePage(LAYOUT, 'blog').some((e) => 'page' in e && e.page === 'blog')).toBe(false);
    });
    it('puts a duplicate right after its original, in the same group', () => {
        expect(insertPageAfter(LAYOUT, 'about-copy', 'about')[1]).toEqual({
            group: 'Marketing',
            pages: ['about', 'about-copy', 'pricing'],
        });
    });
    it('puts a duplicate at the end when the original isn’t in the layout', () => {
        expect(insertPageAfter(LAYOUT, 'x-copy', 'x').at(-1)).toEqual({ page: 'x-copy' });
    });
    it('moves a page to a group, or to the top level with null', () => {
        expect(groupOf(movePageToGroup(LAYOUT, 'blog', 'Account'), 'blog')).toBe('Account');
        expect(movePageToGroup(LAYOUT, 'about', null).at(-1)).toEqual({ page: 'about' });
        expect(movePageToGroup(LAYOUT, 'blog', 'Nope').at(-1)).toEqual({ page: 'blog' });
    });
});
describe('group operations', () => {
    it('adds an empty group at the end', () => {
        expect(addGroup(LAYOUT, 'Docs').at(-1)).toEqual({ group: 'Docs', pages: [] });
    });
    it('renames a group, keeping its pages', () => {
        expect(renameGroup(LAYOUT, 'Marketing', 'Site')[1]).toEqual({ group: 'Site', pages: ['about', 'pricing'] });
    });
    it('deleting a group lifts its pages to the top level, in place', () => {
        expect(removeGroup(LAYOUT, 'Marketing')).toEqual([
            { page: 'home' },
            { page: 'about' },
            { page: 'pricing' },
            { page: 'blog' },
            { group: 'Account', pages: ['login'] },
        ]);
    });
    it('explains a name that can’t be used, case-insensitively, but allows a group its own name', () => {
        expect(groupNameError(LAYOUT, '   ')).toBe('Name the group.');
        expect(groupNameError(LAYOUT, 'marketing')).toBe('A group with that name already exists.');
        expect(groupNameError(LAYOUT, 'Marketing', 'Marketing')).toBeNull();
        expect(groupNameError(LAYOUT, 'Docs')).toBeNull();
    });
    it('suggests the next free default name', () => {
        expect(nextGroupName([])).toBe('Group');
        expect(nextGroupName([{ group: 'Group', pages: [] }, { group: 'group 2', pages: [] }])).toBe('Group 3');
    });
});
describe('moveTargets', () => {
    it('offers every other group, and the top level from inside a group', () => {
        expect(moveTargets(LAYOUT, 'about')).toEqual([
            { label: 'Move to Account', group: 'Account' },
            { label: 'Move to top level', group: null },
        ]);
    });
    it('offers only groups for a top-level page, and nothing with no groups', () => {
        expect(moveTargets(LAYOUT, 'blog').map((t) => t.group)).toEqual(['Marketing', 'Account']);
        expect(moveTargets([{ page: 'home' }], 'home')).toEqual([]);
    });
});
describe('groupPages', () => {
    it('groups top-level pages in list order, where the first of them was', () => {
        expect(groupPages(LAYOUT, ['blog', 'home'], 'Main')).toEqual([
            { group: 'Main', pages: ['home', 'blog'] },
            { group: 'Marketing', pages: ['about', 'pricing'] },
            { group: 'Account', pages: ['login'] },
        ]);
    });
    it('takes pages out of their groups, and puts the new group after the first one’s group', () => {
        expect(groupPages(LAYOUT, ['login', 'pricing'], 'Mixed')).toEqual([
            { page: 'home' },
            { group: 'Marketing', pages: ['about'] },
            { group: 'Mixed', pages: ['pricing', 'login'] },
            { page: 'blog' },
            { group: 'Account', pages: [] },
        ]);
    });
    it('ignores pages that aren’t in the list, and does nothing if none are', () => {
        expect(groupPages(LAYOUT, ['nope', 'blog'], 'One')).toContainEqual({ group: 'One', pages: ['blog'] });
        expect(groupPages(LAYOUT, ['nope'], 'None')).toEqual(LAYOUT);
        expect(groupPages(LAYOUT, [], 'None')).toEqual(LAYOUT);
    });
});
describe('pagesBetween', () => {
    const order = ['home', 'about', 'pricing', 'blog', 'login'];
    it('gives the run between two pages, inclusive, in either direction', () => {
        expect(pagesBetween(order, 'about', 'blog')).toEqual(['about', 'pricing', 'blog']);
        expect(pagesBetween(order, 'blog', 'about')).toEqual(['about', 'pricing', 'blog']);
        expect(pagesBetween(order, 'home', 'home')).toEqual(['home']);
    });
    it('falls back to the clicked page when the anchor is gone, and to nothing when neither is there', () => {
        expect(pagesBetween(order, 'deleted', 'blog')).toEqual(['blog']);
        expect(pagesBetween(order, 'about', 'hidden')).toEqual([]);
    });
});
