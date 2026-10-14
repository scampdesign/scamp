import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import { IconColorPicker } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { combineShadowColor, splitShadowColor, } from '@lib/parsers';
import { resolveTokenChain } from '@lib/resolveToken';
import { usePopover } from '../../hooks/usePopover';
import { NumberInput } from './NumberInput';
import { Tooltip } from './Tooltip';
import { expandHexShorthand } from './colorUtils';
import styles from './Controls.module.css';
// ---- Color format helpers ------------------------------------------------
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#[0-9a-fA-F]{3}$/;
const RGBA_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/;
const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;
// Resolve a `var(--x)` fully to a concrete value, following semantic →
// primitive → hex chains (a single hop would leave a semantic token as
// `var(--color-primitive)`, which won't render in the popover). Falls
// back to the raw value on a broken/cyclic reference.
const resolveVar = (value, tokens) => {
    if (!tokens || tokens.length === 0)
        return value;
    return resolveTokenChain(value, tokens) ?? value;
};
/** Strip the conventional `--color-` (or bare `--`) prefix so token names
 *  read as their semantic label in the picker — `--color-primary` →
 *  `primary`. The full name still commits and shows on hover. */
const stripTokenPrefix = (name) => name.replace(/^--color-/, '').replace(/^--/, '');
/** A token is "semantic" when its value points at another token
 *  (`var(--x)`) rather than holding a literal color. Those are the
 *  purpose-named tokens users reach for first (background, border, …). */
const isSemanticToken = (t) => VAR_RE.test(t.value.trim());
/** Format a token's value for the picker's secondary column: a `var(--x)`
 *  reference becomes the referenced token's clean name (so you can see where
 *  the color came from); a literal (hex/rgb) is shown verbatim. */
const formatTokenValue = (value) => {
    const inner = value.trim().match(VAR_RE)?.[1];
    return inner ? stripTokenPrefix(inner) : value;
};
/**
 * Format an alpha 0..1 as a two-digit hex suffix (`80` for 0.5).
 */
const alphaToHex = (alpha) => {
    const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    return byte.toString(16).padStart(2, '0');
};
/**
 * Pick the hex form a `react-colorful` picker accepts for the
 * current CSS color string. The picker accepts `#rrggbb` and
 * `#rrggbbaa`; we use the 8-digit form when alpha < 1 so the
 * picker's alpha slider shows the right position, and the
 * 6-digit form when fully opaque.
 *
 * Non-decomposable values (currentColor, var(--xyz) that we
 * couldn't resolve) fall back to black so the gradient still
 * renders somewhere reasonable.
 */
const pickerHexFor = (resolved, disableAlpha) => {
    const split = splitShadowColor(resolved);
    if (!split.decomposable)
        return '#000000';
    if (disableAlpha || split.alpha >= 1)
        return split.base;
    return `${split.base}${alphaToHex(split.alpha)}`;
};
/**
 * Decode `react-colorful`'s 8-digit hex output (`#rrggbbaa`)
 * back into the canonical storage form. 6-digit values pass
 * through; 8-digit values run through `combineShadowColor` so
 * alpha < 1 round-trips as `rgba(...)` matching the rest of
 * the codebase.
 */
const fromPickerColor = (nextHex) => {
    if (nextHex.length === 9) {
        const baseHex = nextHex.slice(0, 7);
        const alphaHex = nextHex.slice(7, 9);
        const alpha = parseInt(alphaHex, 16) / 255;
        return combineShadowColor(baseHex, alpha);
    }
    return nextHex;
};
const PRESET_COLORS = [
    'transparent',
    '#ffffff',
    '#000000',
    '#666666',
    '#cccccc',
    '#3b82f6',
    '#ef4444',
    '#22c55e',
    '#f59e0b',
    '#8b5cf6',
];
/**
 * The native API is exposed on macOS and Windows in Electron 31's
 * Chromium 124. Linux is intentionally excluded:
 *   - Native Wayland uses xdg-desktop-portal's ScreenCast
 *     interface, which fails reliably on Ubuntu 24.04 + GNOME 46
 *     with `ScreenCastPortal failed: 3`.
 *   - Forcing XWayland fixes the portal path but Mutter (GNOME's
 *     Wayland compositor) refuses to honour the full-screen X11
 *     input grab the eyedropper needs, so the overlay is dismissed
 *     with "user canceled" the moment it opens.
 * Both Linux paths are upstream-fixable but not in Scamp. Hide the
 * button entirely until either lands, or until we ship an
 * in-window-only fallback as a follow-up.
 */
const isEyeDropperSupported = () => {
    if (typeof window.EyeDropper !== 'function') {
        return false;
    }
    if (/Linux/i.test(navigator.userAgent))
        return false;
    return true;
};
const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 420;
export const ColorInput = ({ value, onChange, onPreview, historyElementId, historyPropertyKey, presetColors, tokens, onOpenTheme, disableAlpha = false, swatchOnly = false, ariaLabel, defaultTab = 'color', mixed = false, }) => {
    const shown = mixed ? '' : value;
    const [draft, setDraft] = useState(shown);
    const [tab, setTab] = useState(defaultTab);
    const popover = usePopover({
        position: {
            width: POPOVER_WIDTH,
            desiredMaxHeight: POPOVER_HEIGHT,
            align: 'left',
            // Flip above whenever the picker wouldn't fit below — the
            // popover is fixed-height so we don't want it clipped by
            // the viewport edge.
            minFitBelow: POPOVER_HEIGHT,
            // When neither side has room for the full-height picker, overlay it
            // centered on the trigger instead of cramping it to one side.
            overlayWhenTight: true,
        },
    });
    useEffect(() => {
        setDraft(shown);
    }, [shown]);
    // ---- Drag state ------------------------------------------------------
    //
    // react-colorful doesn't fire a separate "release" event — every
    // pointermove tick gets `onChange`. We detect the end of a drag
    // via a single-shot window pointerup listener, opened when the
    // first tick fires and torn down on release.
    // Latest local value during a drag, kept in a ref so the
    // deferred release handler reads the freshest value instead of
    // a stale closure.
    const localRef = useRef(value);
    const isDraggingRef = useRef(false);
    const pointerUpRef = useRef(null);
    // Keep localRef synced with `value` when no drag is in flight.
    useEffect(() => {
        if (!isDraggingRef.current) {
            localRef.current = value;
        }
    }, [value]);
    // Clean up the pointerup listener if the component unmounts
    // mid-drag — otherwise the listener leaks and a later release
    // would try to commit through a stale onChange closure.
    useEffect(() => {
        return () => {
            if (pointerUpRef.current) {
                window.removeEventListener('pointerup', pointerUpRef.current);
                pointerUpRef.current = null;
                if (isDraggingRef.current) {
                    // Close the transaction we opened so the history slice
                    // doesn't stay in a perpetual "transaction open" state.
                    useHistoryStore
                        .getState()
                        .endHistoryTransaction({
                        kind: 'patch',
                        elementIds: historyElementId ? [historyElementId] : [],
                        propertyKeys: historyPropertyKey ? [historyPropertyKey] : [],
                    }, useCanvasStore.getState().elements);
                    isDraggingRef.current = false;
                }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ---- Commit helpers --------------------------------------------------
    const commitColor = useCallback((next) => {
        setDraft(next);
        onChange(next);
    }, [onChange]);
    const handlePickerChange = useCallback((nextHex) => {
        // The picker emits `#rrggbb` (HexColorPicker, when
        // disableAlpha) or `#rrggbbaa` (HexAlphaColorPicker).
        // `fromPickerColor` normalises both forms back into the
        // canonical storage shape — `rgba(...)` for non-1 alpha,
        // `#rrggbb` otherwise.
        const next = fromPickerColor(nextHex);
        localRef.current = next;
        setDraft(next);
        onPreview?.(next);
        // First tick of a new drag — open the transaction and
        // arm the release listener.
        if (!isDraggingRef.current) {
            isDraggingRef.current = true;
            useHistoryStore.getState().beginHistoryTransaction();
            const handlePointerUp = () => {
                window.removeEventListener('pointerup', handlePointerUp);
                pointerUpRef.current = null;
                isDraggingRef.current = false;
                const finalValue = localRef.current;
                onChange(finalValue);
                useHistoryStore
                    .getState()
                    .endHistoryTransaction({
                    kind: 'patch',
                    elementIds: historyElementId ? [historyElementId] : [],
                    propertyKeys: historyPropertyKey ? [historyPropertyKey] : [],
                }, useCanvasStore.getState().elements);
            };
            pointerUpRef.current = handlePointerUp;
            window.addEventListener('pointerup', handlePointerUp);
        }
    }, [
        value,
        disableAlpha,
        onPreview,
        onChange,
        historyElementId,
        historyPropertyKey,
    ]);
    // ---- Hex / opacity inputs --------------------------------------------
    const commitDraft = () => {
        const expanded = expandHexShorthand(draft);
        if (expanded.length === 0 || (expanded === value && !mixed)) {
            setDraft(shown);
            return;
        }
        commitColor(expanded);
    };
    const split = splitShadowColor(value);
    const alphaPercent = Math.round(split.alpha * 100);
    const opacityDisabled = !split.decomposable || disableAlpha;
    const handleOpacityChange = (percent) => {
        if (percent === undefined)
            return;
        if (!split.decomposable)
            return;
        const clamped = Math.max(0, Math.min(100, percent));
        commitColor(combineShadowColor(split.base, clamped / 100));
    };
    const handleEyedropperClick = async () => {
        const ctor = window.EyeDropper;
        if (!ctor)
            return;
        try {
            const dropper = new ctor();
            const result = await dropper.open();
            commitColor(result.sRGBHex);
        }
        catch (err) {
            // AbortError = user pressed Escape — silent no-op.
            if (err instanceof DOMException && err.name === 'AbortError')
                return;
            console.warn('[EyeDropper] open() rejected:', err);
        }
    };
    const eyedropperSupported = isEyeDropperSupported();
    const resolved = resolveVar(value, tokens);
    const pickerHex = pickerHexFor(resolved, disableAlpha);
    const isVarRef = VAR_RE.test(value);
    const varName = isVarRef ? value.match(VAR_RE)?.[1] : null;
    // Pick the picker variant: alpha-aware when we model opacity
    // ourselves, plain hex when the caller (e.g. Shadows) manages
    // alpha externally.
    const PickerComponent = disableAlpha ? HexColorPicker : HexAlphaColorPicker;
    // Filter on the RESOLVED value so semantic tokens (`--color-primary:
    // var(--color-brand-500)`) count as colours, not just literal-valued
    // primitives.
    const colorTokens = tokens?.filter((t) => {
        const v = resolveVar(t.value, tokens).trim();
        return (HEX6_RE.test(v) ||
            HEX3_RE.test(v) ||
            RGBA_RE.test(v) ||
            /^[a-z]+$/i.test(v));
    });
    // Surface semantic tokens (those that reference another token) first;
    // primitives follow. V8's Array.sort is stable, so file order holds
    // within each group.
    const orderedTokens = colorTokens
        ? [...colorTokens].sort((a, b) => Number(isSemanticToken(b)) - Number(isSemanticToken(a)))
        : colorTokens;
    // Show the token name in the text input when a var() is applied.
    const displayValue = !mixed && isVarRef && varName ? varName : draft;
    const projectSwatches = [];
    const seenDisplays = new Set();
    for (const t of orderedTokens ?? []) {
        if (seenDisplays.has(t.value))
            continue;
        seenDisplays.add(t.value);
        projectSwatches.push({
            value: `var(${t.name})`,
            display: resolveVar(t.value, tokens),
            label: stripTokenPrefix(t.name),
        });
    }
    const rawProjectColors = presetColors ?? PRESET_COLORS;
    for (const c of rawProjectColors) {
        const resolvedColor = resolveVar(c, tokens);
        if (seenDisplays.has(resolvedColor))
            continue;
        seenDisplays.add(resolvedColor);
        projectSwatches.push({ value: c, display: resolvedColor, label: c });
    }
    const pickerWrap = (_jsx("div", { className: styles.colorPickerWrap, children: popover.open && popover.position && (_jsxs("div", { ref: popover.popoverRef, className: `${styles.colorPopover} ${styles.colorPopoverColorful}`, style: {
                left: popover.position.left,
                top: popover.position.top,
                bottom: popover.position.bottom,
                // Respect the computed clamp so a flipped-up popover can never
                // overflow the top of the window / title bar; scroll if the
                // available space is shorter than the picker's content.
                maxHeight: popover.position.maxHeight,
                overflowY: 'auto',
            }, children: [_jsxs("div", { className: styles.pickerTabs, children: [_jsx("button", { type: "button", className: `${styles.pickerTab} ${tab === 'color' ? styles.pickerTabActive : ''}`, onClick: () => setTab('color'), children: "Color" }), _jsx("button", { type: "button", className: `${styles.pickerTab} ${tab === 'tokens' ? styles.pickerTabActive : ''}`, onClick: () => setTab('tokens'), children: "Tokens" })] }), tab === 'color' ? (_jsxs("div", { className: styles.colorTabBody, children: [_jsx("div", { className: styles.colorPickerCanvas, children: _jsx(PickerComponent, { color: pickerHex, onChange: handlePickerChange }) }), _jsxs("div", { className: styles.colorControlsRow, children: [eyedropperSupported && (_jsx(Tooltip, { label: "Pick from screen", children: _jsx("button", { type: "button", className: styles.colorPopoverEyedropper, onClick: () => void handleEyedropperClick(), "aria-label": "Pick color from screen", children: _jsx(IconColorPicker, { size: 14, stroke: 2.2 }) }) })), _jsx("input", { type: "text", className: `${styles.input} ${styles.colorPopoverHex}`, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commitDraft, onKeyDown: (e) => {
                                        if (e.key === 'Enter')
                                            e.currentTarget.blur();
                                    }, spellCheck: false }), !disableAlpha && (_jsx("div", { className: styles.colorPopoverOpacity, children: _jsx(NumberInput, { value: alphaPercent, onChange: handleOpacityChange, min: 0, max: 100, suffix: "%", disabled: opacityDisabled, title: opacityDisabled
                                            ? 'Opacity is disabled for token / named-color values. Pick a hex to enable.'
                                            : 'Opacity (0–100)' }) }))] }), projectSwatches.length > 0 && (_jsxs("div", { className: styles.swatchSection, children: [_jsx("span", { className: styles.swatchSectionLabel, children: "Project" }), _jsx("div", { className: styles.swatchRow, children: projectSwatches.map((entry) => (_jsx(Tooltip, { label: entry.label, children: _jsx("button", { type: "button", className: styles.swatchButton, style: { background: entry.display }, onClick: () => {
                                                commitColor(entry.value);
                                                popover.setOpen(false);
                                            }, "aria-label": `Apply ${entry.label}` }) }, entry.value))) })] }))] })) : (_jsx("div", { className: styles.tokenList, children: orderedTokens && orderedTokens.length > 0 ? (orderedTokens.map((t) => (_jsxs("button", { type: "button", "data-token": t.name, className: `${styles.tokenListItem} ${value === `var(${t.name})` ? styles.tokenListItemActive : ''}`, onClick: () => {
                            onChange(`var(${t.name})`);
                            popover.setOpen(false);
                        }, children: [_jsx("span", { className: styles.tokenListSwatch, style: { background: resolveVar(t.value, tokens) } }), _jsx("span", { className: styles.tokenListName, title: t.name, children: stripTokenPrefix(t.name) }), _jsx("span", { className: styles.tokenListValue, title: t.value, children: formatTokenValue(t.value) })] }, t.name)))) : (_jsxs("div", { className: styles.tokenListEmpty, children: [_jsx("span", { children: "No tokens defined yet." }), onOpenTheme && (_jsx("button", { type: "button", className: styles.tokenListAddButton, onClick: () => {
                                    popover.setOpen(false);
                                    onOpenTheme();
                                }, children: "+ Add Tokens" }))] })) }))] })) }));
    if (swatchOnly) {
        return (_jsxs("div", { className: styles.colorSwatchOnly, children: [_jsx(Tooltip, { label: "Pick color", children: _jsx("button", { ref: popover.triggerRef, type: "button", className: styles.colorSwatchOnlyButton, "aria-label": ariaLabel ?? 'Pick color', onClick: popover.toggle, style: { background: mixed ? 'transparent' : resolved } }) }), pickerWrap] }));
    }
    return (_jsxs("div", { className: `${styles.colorInputRow} ${styles.colorInputRowSwatch}`, children: [_jsx(Tooltip, { label: "Pick color", children: _jsx("button", { ref: popover.triggerRef, type: "button", className: styles.colorSwatch, "aria-label": ariaLabel ?? 'Pick color', onClick: popover.toggle, children: _jsx("span", { className: styles.colorSwatchInner, style: { background: mixed ? 'transparent' : resolved } }) }) }), _jsx("input", { type: "text", className: styles.colorText, value: displayValue, placeholder: mixed ? 'Mixed' : undefined, onChange: (e) => setDraft(e.target.value), onBlur: commitDraft, onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        e.currentTarget.blur();
                } }), pickerWrap] }));
};
