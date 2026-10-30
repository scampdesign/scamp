import { describe, expect, it } from 'vitest';
import { AGENT_MIN, BOTTOM_MIN, SIDEBAR_MAX, SIDEBAR_MIN, clampBottomHeight, clampSidebarWidth, drawnSidebarWidth, parseStoredSize, } from '@lib/panelSizes';
describe('clampSidebarWidth', () => {
    it('keeps a width inside its limits as it is', () => {
        expect(clampSidebarWidth(300, 1600)).toBe(300);
    });
    it('stops at the minimum and the maximum', () => {
        expect(clampSidebarWidth(50, 1600)).toBe(SIDEBAR_MIN);
        expect(clampSidebarWidth(900, 1600)).toBe(SIDEBAR_MAX);
    });
    it('leaves the canvas its minimum on a narrow window', () => {
        // 1024 - 48 rail - 260 properties - 320 canvas.
        expect(clampSidebarWidth(480, 1024)).toBe(396);
    });
    it('never goes under the minimum, even on a window too narrow for it', () => {
        expect(clampSidebarWidth(300, 600)).toBe(SIDEBAR_MIN);
    });
    it('rounds a dragged fraction to a whole pixel', () => {
        expect(clampSidebarWidth(250.6, 1600)).toBe(251);
    });
});
describe('drawnSidebarWidth', () => {
    it('draws the agent at its floor, and anything else at the width', () => {
        expect(drawnSidebarWidth(240, 1600, true)).toBe(AGENT_MIN);
        expect(drawnSidebarWidth(240, 1600, false)).toBe(240);
    });
    it('keeps a width wider than the agent floor for the agent too', () => {
        expect(drawnSidebarWidth(400, 1600, true)).toBe(400);
    });
});
describe('clampBottomHeight', () => {
    it('keeps a height inside its limits as it is', () => {
        expect(clampBottomHeight(300, 1000)).toBe(300);
    });
    it('stops at the minimum, and at 70% of the window', () => {
        expect(clampBottomHeight(40, 1000)).toBe(BOTTOM_MIN);
        expect(clampBottomHeight(900, 1000)).toBe(700);
    });
    it('leaves the toolbar and the canvas their room on a short window', () => {
        // 600 - 48 toolbar - 200 canvas = 352, under 70% of 600.
        expect(clampBottomHeight(500, 600)).toBe(352);
    });
});
describe('parseStoredSize', () => {
    it('reads a number or a numeric string', () => {
        expect(parseStoredSize(320, 240)).toBe(320);
        expect(parseStoredSize('320', 240)).toBe(320);
    });
    it('falls back on anything else', () => {
        expect(parseStoredSize(null, 240)).toBe(240);
        expect(parseStoredSize(undefined, 240)).toBe(240);
        expect(parseStoredSize('', 240)).toBe(240);
        expect(parseStoredSize('wide', 240)).toBe(240);
        expect(parseStoredSize(Number.NaN, 240)).toBe(240);
        expect(parseStoredSize(Number.POSITIVE_INFINITY, 240)).toBe(240);
        expect(parseStoredSize(-10, 240)).toBe(240);
        expect(parseStoredSize(0, 240)).toBe(240);
        expect(parseStoredSize({ width: 320 }, 240)).toBe(240);
    });
});
