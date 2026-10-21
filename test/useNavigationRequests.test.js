// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanvasStore } from '@store/canvasSlice';
/**
 * The link indicator's jump to another page, at the point an end-to-end
 * test can't hold still: the ordering. It switched the page without
 * saving the one being left, so an edit the quiet window or a pause had
 * deferred was dropped. It now saves first, as the sidebar does.
 * see docs/audits/2026-10-20-repo-audit.md, finding 3
 */
const calls = [];
vi.mock('../src/renderer/src/syncBridge', () => ({
    flushPendingPageWrite: () => {
        calls.push('flush');
    },
}));
const { useNavigationRequests } = await import('@renderer/src/components/projectShell/useNavigationRequests');
const page = (name) => ({ name, tsxPath: `/p/app/${name}/page.tsx`, cssPath: `/p/app/${name}/page.module.css`, tsxContent: '', cssContent: '' });
const project = { name: 'p', path: '/p', format: 'nextjs', pages: [page('home'), page('about')], components: [] };
const componentNav = {
    current: {
        openComponent: () => { },
        activePageName: 'home',
        activeComponent: null,
        persistActiveSource: () => {
            calls.push('persist');
        },
    },
};
describe('useNavigationRequests: the link indicator’s page jump', () => {
    beforeEach(() => {
        calls.length = 0;
        useCanvasStore.getState().requestPageNavigation(null);
    });
    it('saves the page being left, then switches', () => {
        useCanvasStore.getState().requestPageNavigation('about');
        renderHook(() => useNavigationRequests(project, (name) => calls.push(`switch:${name}`), componentNav));
        expect(calls).toEqual(['flush', 'persist', 'switch:about']);
        expect(useCanvasStore.getState().pendingPageNavigation).toBeNull();
    });
    it('does nothing for a page that doesn’t exist', () => {
        useCanvasStore.getState().requestPageNavigation('missing');
        renderHook(() => useNavigationRequests(project, (name) => calls.push(`switch:${name}`), componentNav));
        expect(calls).toEqual([]);
    });
});
