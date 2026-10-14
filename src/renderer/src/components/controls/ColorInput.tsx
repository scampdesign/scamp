import { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import { IconColorPicker } from '@tabler/icons-react';

import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import {
  combineShadowColor,
  splitShadowColor,
} from '@lib/parsers';
import { resolveTokenChain } from '@lib/resolveToken';
import type { ScampElement } from '@lib/element';
import type { ThemeToken } from '@shared/types';
import { usePopover } from '../../hooks/usePopover';
import { NumberInput } from './NumberInput';
import { Tooltip } from './Tooltip';
import { expandHexShorthand } from './colorUtils';
import styles from './Controls.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Called on every drag tick during an active picker
   * interaction. Fires BEFORE `onChange` (which only fires on
   * release). Implementations should apply the value to the
   * canvas DOM directly — bypassing React/Zustand — so the
   * preview updates at the cursor's frame rate without paying
   * the cost of the full sync pipeline on every tick.
   *
   * When omitted, ColorInput suppresses the per-tick preview
   * entirely (legacy callers see the same release-only
   * behaviour they had before).
   */
  onPreview?: (value: string) => void;
  /**
   * The element this picker edits. Used to tag the single
   * history entry that's committed on drag release. Without it,
   * the drag still commits via `onChange` but the entry doesn't
   * carry an element id, so the history-panel label reads
   * "Changed styles" instead of "Changed background — rect_a1b2".
   */
  historyElementId?: string;
  /**
   * The `ScampElement` field the picker edits. Used to label the
   * history entry. Optional for the same reason
   * `historyElementId` is.
   */
  historyPropertyKey?: keyof ScampElement;
  /** Override preset color swatches (e.g. with project-derived colors). */
  presetColors?: ReadonlyArray<string>;
  /** Theme tokens — shown in the Tokens tab of the popover. */
  tokens?: ReadonlyArray<ThemeToken>;
  /** Called when the user clicks "Add Token" from the empty tokens tab. */
  onOpenTheme?: () => void;
  /**
   * When true, the picker treats the value as opaque and the
   * separate opacity input is hidden. Used by sections (e.g.
   * Shadows) that surface opacity as their own control to keep
   * the two axes from racing.
   */
  disableAlpha?: boolean;
  /**
   * Render only the color swatch (no hex text field), filling its
   * container. The swatch still opens the full picker popover on click.
   * Used by the theme panel's palette ramp, where the color block is the
   * content and the hex lives in the popover.
   */
  swatchOnly?: boolean;
  /**
   * Accessible name for the swatch trigger. Defaults to "Pick color".
   * Set it when a screen has several pickers that need telling apart —
   * the theme panel names each one after the token it maps.
   */
  ariaLabel?: string;
  /**
   * Which tab the popover opens on. Defaults to `'color'`. The theme
   * panel opens on `'tokens'`, where mapping to a primitive is the
   * common case and a literal colour is the exception.
   */
  defaultTab?: 'color' | 'tokens';
  /** Several selected elements disagree: show **Mixed**, and commit whatever is picked or typed. */
  mixed?: boolean;
};

// ---- Color format helpers ------------------------------------------------

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#[0-9a-fA-F]{3}$/;
const RGBA_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/;
const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;

// Resolve a `var(--x)` fully to a concrete value, following semantic →
// primitive → hex chains (a single hop would leave a semantic token as
// `var(--color-primitive)`, which won't render in the popover). Falls
// back to the raw value on a broken/cyclic reference.
const resolveVar = (
  value: string,
  tokens: ReadonlyArray<ThemeToken> | undefined
): string => {
  if (!tokens || tokens.length === 0) return value;
  return resolveTokenChain(value, tokens) ?? value;
};

/** Strip the conventional `--color-` (or bare `--`) prefix so token names
 *  read as their semantic label in the picker — `--color-primary` →
 *  `primary`. The full name still commits and shows on hover. */
const stripTokenPrefix = (name: string): string =>
  name.replace(/^--color-/, '').replace(/^--/, '');

/** A token is "semantic" when its value points at another token
 *  (`var(--x)`) rather than holding a literal color. Those are the
 *  purpose-named tokens users reach for first (background, border, …). */
const isSemanticToken = (t: ThemeToken): boolean => VAR_RE.test(t.value.trim());

/** Format a token's value for the picker's secondary column: a `var(--x)`
 *  reference becomes the referenced token's clean name (so you can see where
 *  the color came from); a literal (hex/rgb) is shown verbatim. */
const formatTokenValue = (value: string): string => {
  const inner = value.trim().match(VAR_RE)?.[1];
  return inner ? stripTokenPrefix(inner) : value;
};

/**
 * Format an alpha 0..1 as a two-digit hex suffix (`80` for 0.5).
 */
const alphaToHex = (alpha: number): string => {
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
const pickerHexFor = (resolved: string, disableAlpha: boolean): string => {
  const split = splitShadowColor(resolved);
  if (!split.decomposable) return '#000000';
  if (disableAlpha || split.alpha >= 1) return split.base;
  return `${split.base}${alphaToHex(split.alpha)}`;
};

/**
 * Decode `react-colorful`'s 8-digit hex output (`#rrggbbaa`)
 * back into the canonical storage form. 6-digit values pass
 * through; 8-digit values run through `combineShadowColor` so
 * alpha < 1 round-trips as `rgba(...)` matching the rest of
 * the codebase.
 */
const fromPickerColor = (nextHex: string): string => {
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

// ---- EyeDropper API ------------------------------------------------------
//
// Native Chromium API since 95. Electron 31 ships Chromium 124 so it's
// always available in production, but we feature-detect anyway so a
// future Electron downgrade or a test environment without the API
// fails gracefully (button just doesn't render).

type EyeDropperApi = { open: () => Promise<{ sRGBHex: string }> };
type EyeDropperWindow = { EyeDropper?: new () => EyeDropperApi };

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
const isEyeDropperSupported = (): boolean => {
  if (typeof (window as unknown as EyeDropperWindow).EyeDropper !== 'function') {
    return false;
  }
  if (/Linux/i.test(navigator.userAgent)) return false;
  return true;
};

// ---- Component -----------------------------------------------------------

type PopoverTab = 'color' | 'tokens';

const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 420;

export const ColorInput = ({
  value,
  onChange,
  onPreview,
  historyElementId,
  historyPropertyKey,
  presetColors,
  tokens,
  onOpenTheme,
  disableAlpha = false,
  swatchOnly = false,
  ariaLabel,
  defaultTab = 'color',
  mixed = false,
}: Props): JSX.Element => {
  const shown = mixed ? '' : value;
  const [draft, setDraft] = useState(shown);
  const [tab, setTab] = useState<PopoverTab>(defaultTab);


  const popover = usePopover<HTMLButtonElement>({
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
  const pointerUpRef = useRef<(() => void) | null>(null);

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
            .endHistoryTransaction(
              {
                kind: 'patch',
                elementIds: historyElementId ? [historyElementId] : [],
                propertyKeys: historyPropertyKey ? [historyPropertyKey] : [],
              },
              useCanvasStore.getState().elements
            );
          isDraggingRef.current = false;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Commit helpers --------------------------------------------------

  const commitColor = useCallback(
    (next: string): void => {
      setDraft(next);
      onChange(next);
    },
    [onChange]
  );

  const handlePickerChange = useCallback(
    (nextHex: string): void => {
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
        const handlePointerUp = (): void => {
          window.removeEventListener('pointerup', handlePointerUp);
          pointerUpRef.current = null;
          isDraggingRef.current = false;
          const finalValue = localRef.current;
          onChange(finalValue);
          useHistoryStore
            .getState()
            .endHistoryTransaction(
              {
                kind: 'patch',
                elementIds: historyElementId ? [historyElementId] : [],
                propertyKeys: historyPropertyKey ? [historyPropertyKey] : [],
              },
              useCanvasStore.getState().elements
            );
        };
        pointerUpRef.current = handlePointerUp;
        window.addEventListener('pointerup', handlePointerUp);
      }
    },
    [
      value,
      disableAlpha,
      onPreview,
      onChange,
      historyElementId,
      historyPropertyKey,
    ]
  );

  // ---- Hex / opacity inputs --------------------------------------------

  const commitDraft = (): void => {
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

  const handleOpacityChange = (percent: number | undefined): void => {
    if (percent === undefined) return;
    if (!split.decomposable) return;
    const clamped = Math.max(0, Math.min(100, percent));
    commitColor(combineShadowColor(split.base, clamped / 100));
  };

  const handleEyedropperClick = async (): Promise<void> => {
    const ctor = (window as unknown as EyeDropperWindow).EyeDropper;
    if (!ctor) return;
    try {
      const dropper = new ctor();
      const result = await dropper.open();
      commitColor(result.sRGBHex);
    } catch (err) {
      // AbortError = user pressed Escape — silent no-op.
      if (err instanceof DOMException && err.name === 'AbortError') return;
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
    return (
      HEX6_RE.test(v) ||
      HEX3_RE.test(v) ||
      RGBA_RE.test(v) ||
      /^[a-z]+$/i.test(v)
    );
  });

  // Surface semantic tokens (those that reference another token) first;
  // primitives follow. V8's Array.sort is stable, so file order holds
  // within each group.
  const orderedTokens = colorTokens
    ? [...colorTokens].sort(
        (a, b) => Number(isSemanticToken(b)) - Number(isSemanticToken(a))
      )
    : colorTokens;

  // Show the token name in the text input when a var() is applied.
  const displayValue = !mixed && isVarRef && varName ? varName : draft;

  // ---- Project swatches -----------------------------------------------
  //
  // Single combined row of every color used in the project — theme
  // tokens first (semantically richer; `var(--accent)` is preferred
  // over its resolved hex), then any raw colors applied in CSS that
  // aren't already represented by a token's resolved value.
  //
  // Each entry carries three pieces of data:
  //   - `value`   — what gets committed on click
  //   - `display` — what renders as the swatch background (must be a
  //                 resolved color string; `var(...)` doesn't render
  //                 in the popover because the project's CSS
  //                 variables aren't in scope here)
  //   - `label`   — tooltip text
  type SwatchEntry = { value: string; display: string; label: string };
  const projectSwatches: SwatchEntry[] = [];
  const seenDisplays = new Set<string>();
  for (const t of orderedTokens ?? []) {
    if (seenDisplays.has(t.value)) continue;
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
    if (seenDisplays.has(resolvedColor)) continue;
    seenDisplays.add(resolvedColor);
    projectSwatches.push({ value: c, display: resolvedColor, label: c });
  }

  const pickerWrap = (
    <div className={styles.colorPickerWrap}>
        {popover.open && popover.position && (
          <div
            ref={popover.popoverRef}
            className={`${styles.colorPopover} ${styles.colorPopoverColorful}`}
            style={{
              left: popover.position.left,
              top: popover.position.top,
              bottom: popover.position.bottom,
              // Respect the computed clamp so a flipped-up popover can never
              // overflow the top of the window / title bar; scroll if the
              // available space is shorter than the picker's content.
              maxHeight: popover.position.maxHeight,
              overflowY: 'auto',
            }}
          >
            <div className={styles.pickerTabs}>
              <button
                type="button"
                className={`${styles.pickerTab} ${tab === 'color' ? styles.pickerTabActive : ''}`}
                onClick={() => setTab('color')}
              >
                Color
              </button>
              <button
                type="button"
                className={`${styles.pickerTab} ${tab === 'tokens' ? styles.pickerTabActive : ''}`}
                onClick={() => setTab('tokens')}
              >
                Tokens
              </button>
            </div>
            {tab === 'color' ? (
              <div className={styles.colorTabBody}>
                <div className={styles.colorPickerCanvas}>
                  <PickerComponent
                    color={pickerHex}
                    onChange={handlePickerChange}
                  />
                </div>
                <div className={styles.colorControlsRow}>
                  {eyedropperSupported && (
                    <Tooltip label="Pick from screen">
                      <button
                        type="button"
                        className={styles.colorPopoverEyedropper}
                        onClick={() => void handleEyedropperClick()}
                        aria-label="Pick color from screen"
                      >
                        <IconColorPicker size={14} stroke={2.2} />
                      </button>
                    </Tooltip>
                  )}
                  <input
                    type="text"
                    className={`${styles.input} ${styles.colorPopoverHex}`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    spellCheck={false}
                  />
                  {!disableAlpha && (
                    <div className={styles.colorPopoverOpacity}>
                      <NumberInput
                        value={alphaPercent}
                        onChange={handleOpacityChange}
                        min={0}
                        max={100}
                        suffix="%"
                        disabled={opacityDisabled}
                        title={
                          opacityDisabled
                            ? 'Opacity is disabled for token / named-color values. Pick a hex to enable.'
                            : 'Opacity (0–100)'
                        }
                      />
                    </div>
                  )}
                </div>
                {projectSwatches.length > 0 && (
                  <div className={styles.swatchSection}>
                    <span className={styles.swatchSectionLabel}>Project</span>
                    <div className={styles.swatchRow}>
                      {projectSwatches.map((entry) => (
                        <Tooltip key={entry.value} label={entry.label}>
                          <button
                            type="button"
                            className={styles.swatchButton}
                            style={{ background: entry.display }}
                            onClick={() => {
                              commitColor(entry.value);
                              popover.setOpen(false);
                            }}
                            aria-label={`Apply ${entry.label}`}
                          />
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.tokenList}>
                {orderedTokens && orderedTokens.length > 0 ? (
                  orderedTokens.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      // The visible label is the stripped name (`primary`),
                      // which is a display choice and free to change. Tests
                      // and tooling target the full token name here instead.
                      data-token={t.name}
                      className={`${styles.tokenListItem} ${value === `var(${t.name})` ? styles.tokenListItemActive : ''}`}
                      onClick={() => {
                        onChange(`var(${t.name})`);
                        popover.setOpen(false);
                      }}
                    >
                      <span
                        className={styles.tokenListSwatch}
                        style={{ background: resolveVar(t.value, tokens) }}
                      />
                      <span className={styles.tokenListName} title={t.name}>
                        {stripTokenPrefix(t.name)}
                      </span>
                      <span className={styles.tokenListValue} title={t.value}>
                        {formatTokenValue(t.value)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={styles.tokenListEmpty}>
                    <span>No tokens defined yet.</span>
                    {onOpenTheme && (
                      <button
                        type="button"
                        className={styles.tokenListAddButton}
                        onClick={() => {
                          popover.setOpen(false);
                          onOpenTheme();
                        }}
                      >
                        + Add Tokens
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
    </div>
  );

  if (swatchOnly) {
    return (
      <div className={styles.colorSwatchOnly}>
        <Tooltip label="Pick color">
          <button
            ref={popover.triggerRef}
            type="button"
            className={styles.colorSwatchOnlyButton}
            aria-label={ariaLabel ?? 'Pick color'}
            onClick={popover.toggle}
            style={{ background: mixed ? 'transparent' : resolved }}
          />
        </Tooltip>
        {pickerWrap}
      </div>
    );
  }

  return (
    <div className={`${styles.colorInputRow} ${styles.colorInputRowSwatch}`}>
      <Tooltip label="Pick color">
        <button
          ref={popover.triggerRef}
          type="button"
          className={styles.colorSwatch}
          aria-label={ariaLabel ?? 'Pick color'}
          onClick={popover.toggle}
        >
          <span
            className={styles.colorSwatchInner}
            style={{ background: mixed ? 'transparent' : resolved }}
          />
        </button>
      </Tooltip>
      <input
        type="text"
        className={styles.colorText}
        value={displayValue}
        placeholder={mixed ? 'Mixed' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {pickerWrap}
    </div>
  );
};
