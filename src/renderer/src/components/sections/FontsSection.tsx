import { useMemo, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useFontsStore } from '@store/fontsSlice';
import { removeFamilyFromUrl } from '@lib/googleFontsEmbed';
import { parseFontEmbed } from '@lib/fontEmbed';
import { fetchAdobeKitFamilies } from '@lib/adobeFontsFetch';
import { serializeThemeFile } from '@lib/parseTheme';
import { errorMessage } from '@shared/errorMessage';
import { unionFamiliesFromUrls } from '../../lib/applyThemeFonts';
import { Button } from '../controls/Button';
import styles from './FontsSection.module.css';

type Props = {
  projectPath: string;
};

/**
 * One row per family (or per unrecognized URL). For Google kits with
 * multiple `?family=` params we expand to one row per family and
 * removing a row rewrites the URL with that family dropped. For
 * Adobe kits the kit URL is opaque — removing ANY family row from
 * an Adobe kit removes the whole kit (and every family in it),
 * since you can't tell Adobe to drop a single family from a kit.
 */
type FontRow =
  | { kind: 'google-family'; family: string; sourceUrl: string }
  | {
      kind: 'adobe-family';
      family: string;
      sourceUrl: string;
      kitId: string;
    }
  | { kind: 'unrecognized'; sourceUrl: string };

const providerLabel = (row: FontRow): string => {
  switch (row.kind) {
    case 'google-family':
      return 'Google';
    case 'adobe-family':
      return 'Adobe';
    case 'unrecognized':
      return '';
  }
};

const removeTooltip = (row: FontRow): string => {
  switch (row.kind) {
    case 'google-family':
      return 'Remove this family';
    case 'adobe-family':
      return 'Remove kit (removes every family in this Adobe Fonts kit)';
    case 'unrecognized':
      return 'Remove this entry';
  }
};

export const FontsSection = ({ projectPath }: Props): JSX.Element => {
  const projectFontUrls = useFontsStore((s) => s.projectFontUrls);
  const kitFamilies = useFontsStore((s) => s.kitFamilies);
  const setProjectFonts = useFontsStore((s) => s.setProjectFonts);
  const setKitFamilies = useFontsStore((s) => s.setKitFamilies);
  // Write the BASE (:root) tokens and per-theme override blocks — NOT the
  // derived active-theme list — so a font edit while previewing a non-Light
  // theme neither writes that theme's values into :root nor drops the
  // `.dark`/`.theme-*` blocks. see docs/archive/2026-07-23-design-system-plan.md
  const themeBaseTokens = useCanvasStore((s) => s.themeBaseTokens);
  const themeOverrides = useCanvasStore((s) => s.themeOverrides);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Flatten the stored URL list into one row per family. Each URL
  // contributes 0..n rows depending on how many families resolve.
  // Resolution policy:
  //   - Google: families come from the URL parser, synchronously.
  //   - Adobe: families come from the in-store `kitFamilies` cache,
  //            populated on add and refreshed on project open.
  //            If the cache is empty (resolver failed), surface an
  //            `unrecognized` row so the user can remove the URL.
  //   - Neither: an unrecognized row.
  const rows: FontRow[] = useMemo(() => {
    const out: FontRow[] = [];
    for (const url of projectFontUrls) {
      const parsed = parseFontEmbed(url);
      if (!parsed.ok) {
        out.push({ kind: 'unrecognized', sourceUrl: url });
        continue;
      }
      if (parsed.provider === 'google') {
        for (const family of parsed.families) {
          out.push({ kind: 'google-family', family, sourceUrl: url });
        }
      } else {
        const cached = kitFamilies[url];
        if (!cached || cached.length === 0) {
          out.push({ kind: 'unrecognized', sourceUrl: url });
          continue;
        }
        for (const family of cached) {
          out.push({
            kind: 'adobe-family',
            family,
            sourceUrl: url,
            kitId: parsed.kitId,
          });
        }
      }
    }
    return out;
  }, [projectFontUrls, kitFamilies]);

  const writeTheme = async (urls: ReadonlyArray<string>): Promise<void> => {
    // Read the current file so token blocks and hand-written CSS survive
    // when we rewrite only the font imports.
    const existing = await window.scamp.readTheme({ projectPath });
    const content = serializeThemeFile(
      {
        tokens: [...themeBaseTokens],
        themes: [...themeOverrides],
        fontImportUrls: [...urls],
      },
      existing
    );
    await window.scamp.writeTheme({ projectPath, content });
  };

  const handleAdd = async (): Promise<void> => {
    const parsed = parseFontEmbed(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (projectFontUrls.includes(parsed.url)) {
      setError('That font is already added.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (parsed.provider === 'google') {
        const nextUrls = [...projectFontUrls, parsed.url];
        const allFamilies = unionFamiliesFromUrls(nextUrls, kitFamilies);
        setProjectFonts({ families: allFamilies, urls: nextUrls });
        await writeTheme(nextUrls);
        setDraft('');
        return;
      }
      // Adobe kit — fetch the CSS to discover families before we
      // commit anything. On fetch failure we surface the error inline
      // and don't touch the store or theme.css.
      const fetched = await fetchAdobeKitFamilies(parsed.url);
      if (!fetched.ok) {
        setError(fetched.error);
        return;
      }
      const nextUrls = [...projectFontUrls, parsed.url];
      const nextKit = { ...kitFamilies, [parsed.url]: fetched.families };
      setKitFamilies(parsed.url, fetched.families);
      const allFamilies = unionFamiliesFromUrls(nextUrls, nextKit);
      setProjectFonts({ families: allFamilies, urls: nextUrls });
      await writeTheme(nextUrls);
      setDraft('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (row: FontRow): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      let nextUrls: string[];
      if (row.kind === 'unrecognized' || row.kind === 'adobe-family') {
        // Adobe kit removal is atomic — drop the entire URL. Same
        // for unrecognized entries (no family-level structure to
        // preserve).
        nextUrls = projectFontUrls.filter((u) => u !== row.sourceUrl);
      } else {
        // Google: rewrite the URL with that family dropped.
        const rewritten = removeFamilyFromUrl(row.sourceUrl, row.family);
        if (rewritten === null) {
          nextUrls = projectFontUrls.filter((u) => u !== row.sourceUrl);
        } else {
          nextUrls = projectFontUrls.map((u) =>
            u === row.sourceUrl ? rewritten : u
          );
        }
      }
      // After mutating URLs, recompute the union family list using
      // the (unchanged) kit cache — entries for now-orphaned URLs
      // are pruned by `setProjectFonts` itself.
      const allFamilies = unionFamiliesFromUrls(nextUrls, kitFamilies);
      setProjectFonts({ families: allFamilies, urls: nextUrls });
      await writeTheme(nextUrls);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.pasteRow}>
        <input
          type="text"
          className={styles.pasteInput}
          placeholder="Paste a Google Fonts or Adobe Fonts embed link"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) {
              e.preventDefault();
              void handleAdd();
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <Button
          variant="secondary"
          onClick={() => void handleAdd()}
          disabled={busy || draft.trim().length === 0}
        >
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.help}>
        Fonts you add here are saved in <code>theme.css</code> in your
        project folder. Import that file in your production build to use
        the fonts outside Scamp.
      </div>
      {rows.length === 0 ? (
        <div className={styles.empty}>No project fonts yet.</div>
      ) : (
        <div className={styles.list}>
          {rows.map((row, i) => {
            const key =
              row.kind === 'unrecognized'
                ? `unrecognized::${row.sourceUrl}::${i}`
                : `${row.kind}::${row.sourceUrl}::${row.family}`;
            const label = providerLabel(row);
            return (
              <div key={key} className={styles.listItem}>
                <div className={styles.listItemBody}>
                  <div className={styles.listItemFamilies}>
                    {row.kind === 'unrecognized'
                      ? '(unrecognized URL)'
                      : row.family}
                  </div>
                  {row.kind === 'unrecognized' && (
                    <div className={styles.listItemUrl}>{row.sourceUrl}</div>
                  )}
                </div>
                {label && (
                  <span
                    className={styles.providerTag}
                    data-provider={label.toLowerCase()}
                  >
                    {label}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRemove(row)}
                  disabled={busy}
                  title={removeTooltip(row)}
                >
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
