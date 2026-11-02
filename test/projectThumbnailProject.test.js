// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCanvasStore } from '@store/canvasSlice';
// Asserted at the capture boundary, not at the write: jsdom cannot
// rasterise, so a test that only watched for a write would pass with
// or without the guard.
const captured = vi.hoisted(() => ({ calls: [] }));
vi.mock('../src/renderer/src/lib/exportCapture', () => ({
    captureIsolatedPng: (args) => {
        captured.calls.push(args);
        return Promise.resolve(null);
    },
}));
import { captureAndPersistProjectThumbnail, flushPendingProjectThumbnail, } from '../src/renderer/src/lib/projectThumbnail';
/**
 * Which project a scheduled capture is allowed to photograph.
 *
 * The capture reads the canvas that is on screen and writes to a path
 * decided 1.5 seconds earlier. Close one project and open another
 * inside that window and the two disagree — the photograph is of the
 * new project, filed under the old one, and a card wears another
 * project's screenshot. see docs/notes/project-thumbnails.md
 */
const writes = [];
beforeEach(() => {
    writes.length = 0;
    captured.calls.length = 0;
    vi.useFakeTimers();
    // A canvas frame for the capture to find. Its size is what decides
    // whether the capture proceeds at all.
    document.body.innerHTML =
        '<div data-testid="canvas-frame" style="width: 100px; height: 100px"></div>';
    const frame = document.querySelector('[data-testid="canvas-frame"]');
    Object.defineProperty(frame, 'offsetWidth', { value: 1440, configurable: true });
    Object.defineProperty(frame, 'offsetHeight', { value: 900, configurable: true });
    globalThis.window.scamp = {
        writeProjectThumbnail: ({ projectPath }) => {
            writes.push(projectPath);
            return Promise.resolve({ ok: true });
        },
    };
});
afterEach(() => {
    vi.useRealTimers();
});
const HOME = { name: 'home', tsxPath: '/p/app/page.tsx', cssPath: '/p/app/page.module.css' };
const ABOUT = { name: 'about', tsxPath: '/p/app/about/page.tsx', cssPath: '/p/app/about/page.module.css' };
const scheduleFor = (projectPath) => {
    useCanvasStore.setState({ projectPath, activePage: HOME, activeComponent: null });
    captureAndPersistProjectThumbnail({ projectPath, pageName: 'home', cssPath: HOME.cssPath });
};
describe('a scheduled project thumbnail', () => {
    it('does not photograph a project that replaced the one it was scheduled for', async () => {
        scheduleFor('/tmp/alpha');
        // Alpha closes and beta opens inside the debounce.
        useCanvasStore.setState({ projectPath: '/tmp/beta' });
        await vi.advanceTimersByTimeAsync(5000);
        expect(captured.calls).toEqual([]);
    });
    it('does not photograph anything once every project is closed', async () => {
        scheduleFor('/tmp/alpha');
        useCanvasStore.setState({ projectPath: null });
        await vi.advanceTimersByTimeAsync(5000);
        expect(captured.calls).toEqual([]);
    });
    it('still photographs while its own project is the open one', async () => {
        // The other half of the guard: it must not simply stop capturing.
        scheduleFor('/tmp/alpha');
        await vi.advanceTimersByTimeAsync(5000);
        expect(captured.calls).toHaveLength(1);
    });
    it('does not photograph another page opened inside the debounce', async () => {
        // Home saved, then About opened: the canvas now shows About, which
        // would otherwise be filed as the project's cover.
        scheduleFor('/tmp/alpha');
        useCanvasStore.setState({ activePage: ABOUT });
        await vi.advanceTimersByTimeAsync(5000);
        expect(captured.calls).toEqual([]);
    });
    it('lets the close path through, since it flushes before the unmount', () => {
        // The store still says alpha here: the flush runs before
        // `setProject(null)` precisely so the canvas is still its own.
        scheduleFor('/tmp/alpha');
        flushPendingProjectThumbnail('/tmp/alpha');
        expect(captured.calls).toHaveLength(1);
    });
    it('drops a flush for a project that is no longer the open one', () => {
        scheduleFor('/tmp/alpha');
        useCanvasStore.setState({ projectPath: '/tmp/beta' });
        flushPendingProjectThumbnail('/tmp/alpha');
        expect(captured.calls).toEqual([]);
    });
});
