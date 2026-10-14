import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconColorSwatch } from '@tabler/icons-react';
import { filterFonts } from '@lib/fontFilter';
import { formatFontValue, quoteFamilyName } from '@lib/fontFallback';
import { useFontsStore, type AvailableFont } from '@store/fontsSlice';
import type { ThemeToken } from '@shared/types';
import { usePopover } from '../../hooks/usePopover';
import { Tooltip } from './Tooltip';
import styles from './FontPicker.module.css';

type Props = {
  /**
   * Current stored CSS `font-family` value, e.g. `"Inter", sans-serif`.
   * An empty string means "system font" (no override).
   */
  value: string;
  /** Available fonts with their source (system vs project). */
  fonts: ReadonlyArray<AvailableFont>;
  /** Font-family theme tokens — shown at the top of the dropdown. */
  fontTokens?: ReadonlyArray<ThemeToken>;
  /**
   * Called with the full formatted CSS expression — `formatFontValue()`
   * output — so the caller writes it straight to `element.fontFamily`.
   * An empty string clears the override.
   */
  onChange: (value: string) => void;
  /** Tooltip shown on hover of the closed trigger. */
  title?: string;
  /** Several selected elements disagree: the trigger reads **Mixed**. */
  mixed?: boolean;
};

const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;

const ROW_HEIGHT = 28;
const VIEWPORT_HEIGHT = 280;
const POPOVER_WIDTH = 260;
/** search input (30) + viewport (280) + borders (~2) */
const POPOVER_HEIGHT = 312;
/**
 * How many extra rows to render above and below the visible window so
 * fast scrolling doesn't flash blank rows at the edges.
 */
const OVERSCAN = 4;
const SYSTEM_OPTION = { value: '', label: 'System font' } as const;

type Option = {
  /** Full CSS expression — what we write to `element.fontFamily`. */
  value: string;
  /** Human-readable label shown in the row. */
  label: string;
  /** Family name to apply as `style.fontFamily` for the preview. */
  previewFamily: string | null;
  /** True when the row doesn't correspond to an enumerated system font. */
  unknown?: boolean;
  /** Badge text shown at the right of the row (e.g. "Project"). */
  badge?: string;
  /** True when this row is a theme token — renders the swatch icon. */
  isToken?: boolean;
  /**
   * True when this row is a "use what the user typed" escape hatch —
   * shown when the search query has no matches in the enumerated
   * fonts. Lets the user commit a font name Chromium's
   * `queryLocalFonts()` doesn't return (which happens for fonts with
   * unusual name-table metadata) and that the browser will still
   * render via fontconfig at draw time.
   */
  custom?: boolean;
};

/**
 * Extract the primary family name from a stored CSS `font-family`
 * value. Handles quoted and unquoted forms, strips a trailing generic
 * fallback. Returns the trimmed original if parsing fails so the
 * picker never throws on agent-written values.
 */
const primaryFamily = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  const firstComma = trimmed.indexOf(',');
  const head = firstComma === -1 ? trimmed : trimmed.slice(0, firstComma);
  const cleaned = head.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1);
  }
  return cleaned;
};

export const FontPicker = ({
  value,
  fonts,
  fontTokens = [],
  onChange,
  title,
  mixed = false,
}: Props): JSX.Element => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const popover = usePopover<HTMLButtonElement>({
    position: {
      width: POPOVER_WIDTH,
      desiredMaxHeight: POPOVER_HEIGHT,
      align: 'left',
      minFitBelow: POPOVER_HEIGHT,
    },
    onClose: () => {
      setQuery('');
      popover.triggerRef.current?.focus();
    },
  });

  // Label shown on the closed trigger. When the stored value is a
  // `var(--name)` reference, show the token name rather than whatever
  // `primaryFamily` would extract.
  const triggerLabel = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const m = trimmed.match(VAR_RE);
    if (m) return m[1] ?? trimmed;
    return primaryFamily(trimmed);
  }, [value]);

  const triggerIsToken = VAR_RE.test(value.trim());

  // Options visible in the dropdown for the current query. The system
  // default and (when applicable) a "Custom" row for a stored value we
  // don't know about sit above the enumerated fonts.
  const options = useMemo<Option[]>(() => {
    const familyNames = fonts.map((f) => f.family);
    const filtered = filterFonts(familyNames, query);
    const sourceByFamily = new Map<string, AvailableFont['source']>();
    for (const f of fonts) sourceByFamily.set(f.family, f.source);

    const currentFamily = primaryFamily(value);
    const currentIsKnown =
      currentFamily.length > 0 &&
      fonts.some((f) => f.family.toLowerCase() === currentFamily.toLowerCase());

    const result: Option[] = [];
    // "System font" stays at the top unless the user is actively
    // searching; hide when a non-empty query wouldn't match it.
    const q = query.trim().toLowerCase();
    if (q.length === 0 || 'system font'.includes(q)) {
      result.push({
        value: SYSTEM_OPTION.value,
        label: SYSTEM_OPTION.label,
        previewFamily: null,
      });
    }
    // Theme tokens for font-family — shown above the enumerated fonts
    // so they're always easy to pick.
    for (const token of fontTokens) {
      if (q.length > 0 && !token.name.toLowerCase().includes(q)) continue;
      result.push({
        value: `var(${token.name})`,
        label: token.name,
        previewFamily: primaryFamily(token.value) || null,
        badge: 'Token',
        isToken: true,
      });
    }
    // Preserve the stored value as a first-class row if it's not in the
    // enumerated font list AND isn't a token we already surfaced.
    const storedIsToken = VAR_RE.test(value.trim());
    if (
      value.length > 0 &&
      !currentIsKnown &&
      !storedIsToken &&
      q.length === 0
    ) {
      result.push({
        value,
        label: currentFamily || value,
        previewFamily: currentFamily || null,
        unknown: true,
      });
    }
    for (const family of filtered) {
      const source = sourceByFamily.get(family);
      result.push({
        value: formatFontValue(family),
        label: family,
        previewFamily: family,
        badge: source === 'project' ? 'Project' : undefined,
      });
    }
    // Escape hatch: if the user typed something and nothing matches,
    // offer it as a literal font-family value. The browser still
    // resolves the family via fontconfig at render time even when
    // queryLocalFonts() doesn't enumerate it.
    if (q.length > 0 && result.length === 0) {
      const typed = query.trim();
      result.push({
        value: formatFontValue(typed),
        label: typed,
        previewFamily: typed,
        custom: true,
      });
    }
    return result;
  }, [fonts, fontTokens, query, value]);

  // Reset active row when the filtered list changes under us.
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, options.length - 1)));
  }, [options.length]);

  const handleScroll = useCallback((): void => {
    const vp = viewportRef.current;
    if (vp) setScrollTop(vp.scrollTop);
  }, []);

  // Focus the search input on open. Seed the active row on the
  // currently selected font so Enter without typing confirms the
  // existing selection. Also re-enumerate system fonts so a font
  // installed AFTER app start surfaces in the picker without a
  // restart — `refreshSystemFonts` is cheap on a warm session.
  useEffect(() => {
    if (!popover.open) return;
    setQuery('');
    setScrollTop(0);
    void useFontsStore.getState().refreshSystemFonts();
    const raf = requestAnimationFrame(() => {
      searchRef.current?.focus();
      const currentIdx = options.findIndex((o) => o.value === value);
      setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    });
    return () => cancelAnimationFrame(raf);
    // We intentionally don't re-run when `options` or `value` change —
    // this effect is a one-shot open handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover.open]);

  // Scroll the active row into view on arrow-key navigation.
  useEffect(() => {
    if (!popover.open) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const rowTop = activeIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    if (rowTop < vp.scrollTop) {
      vp.scrollTop = rowTop;
    } else if (rowBottom > vp.scrollTop + VIEWPORT_HEIGHT) {
      vp.scrollTop = rowBottom - VIEWPORT_HEIGHT;
    }
  }, [activeIndex, popover.open]);

  const commit = (option: Option): void => {
    onChange(option.value);
    popover.setOpen(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, options.length - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = options[activeIndex];
      if (selected) commit(selected);
      return;
    }
    // Stop shortcut keys (V, T, I, etc.) from firing while the user
    // types into the search field. Escape is handled by usePopover at
    // the document level.
    e.stopPropagation();
  };

  // Windowed render: compute which rows are on-screen.
  const totalHeight = options.length * ROW_HEIGHT;
  const firstVisible = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN
  );
  const lastVisible = Math.min(
    options.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleRows = options.slice(firstVisible, lastVisible);

  const triggerEl = (
    <button
      ref={popover.triggerRef}
      type="button"
      className={`${styles.trigger} ${popover.open ? styles.triggerOpen : ''}`}
      onClick={popover.toggle}
      // Render the trigger itself in the selected font so it doubles as
      // a preview. Tokens skip this — we show the token name in the
      // default UI font alongside a swatch icon.
      style={
        !mixed && triggerLabel && !triggerIsToken
          ? { fontFamily: quoteFamilyName(triggerLabel) }
          : undefined
      }
    >
      {!mixed && triggerIsToken && (
        <span className={styles.triggerIcon} aria-hidden="true">
          <IconColorSwatch size={14} stroke={1.75} />
        </span>
      )}
      <span
        className={`${styles.triggerLabel} ${
          triggerLabel && !mixed ? '' : styles.triggerPlaceholder
        }`}
      >
        {mixed ? 'Mixed' : triggerLabel ?? 'System font'}
      </span>
      <span className={styles.triggerCaret}>▾</span>
    </button>
  );

  return (
    <>
      {title ? <Tooltip label={title}>{triggerEl}</Tooltip> : triggerEl}
      {popover.open && popover.position && (
        <div
          ref={popover.popoverRef}
          className={styles.popover}
          style={{
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
          }}
          role="listbox"
        >
          <input
            ref={searchRef}
            className={styles.search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setScrollTop(0);
              if (viewportRef.current) viewportRef.current.scrollTop = 0;
            }}
            onKeyDown={handleKey}
            placeholder="Search fonts…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div
            ref={viewportRef}
            className={styles.listViewport}
            onScroll={handleScroll}
          >
            {options.length === 0 ? (
              <div className={styles.rowEmpty}>No matching fonts</div>
            ) : (
              <div
                className={styles.listSpacer}
                style={{ height: totalHeight }}
              >
                {visibleRows.map((option, i) => {
                  const idx = firstVisible + i;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={`${option.value}::${option.label}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`${styles.row} ${isActive ? styles.rowActive : ''} ${
                        option.unknown ? styles.rowUnknown : ''
                      }`}
                      style={{
                        top: idx * ROW_HEIGHT,
                        height: ROW_HEIGHT,
                        fontFamily: option.previewFamily
                          ? quoteFamilyName(option.previewFamily)
                          : undefined,
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => {
                        // Prevent blur of the search input (which would
                        // close the popover) before onClick fires.
                        e.preventDefault();
                      }}
                      onClick={() => commit(option)}
                    >
                      {option.isToken && (
                        <span className={styles.rowIcon} aria-hidden="true">
                          <IconColorSwatch size={14} stroke={1.75} />
                        </span>
                      )}
                      <span className={styles.rowLabel}>
                        {option.custom
                          ? `Use "${option.label}"`
                          : option.unknown
                            ? `Custom: ${option.label}`
                            : option.label}
                      </span>
                      {option.badge && (
                        <span className={styles.rowBadge}>{option.badge}</span>
                      )}
                      {option.custom && (
                        <span className={styles.rowBadge}>Custom</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
