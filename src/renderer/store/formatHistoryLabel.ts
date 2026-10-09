import type { ScampElement } from '@lib/element';
import { classNameFor } from '@lib/generateCode';
import { FIELD_LABELS } from '@lib/fieldLabels';
import type { HistoryEntry } from './historyTypes';

/**
 * The display name shown after a "Changed [property] — " or
 * similar action label. Uses the element's CURRENT name in the
 * elements map — so a rename retroactively re-labels every
 * past entry referencing that element.
 *
 * For elements that have since been deleted, returns the
 * fallback string (`[deleted]` by default).
 */
const resolveElementName = (
  elements: Record<string, ScampElement>,
  id: string,
  fallback: string
): string => {
  const el = elements[id];
  if (!el) return fallback;
  return classNameFor(el);
};

/**
 * Dedupe + format a list of `ScampElement` field keys into a
 * comma-separated CSS-property string. Used for `patch`-kind
 * labels.
 *
 *   ['widthMode', 'widthValue']        → 'width'
 *   ['backgroundColor']                → 'background'
 *   ['x', 'y']                         → 'left, top'
 *   []                                 → 'styles' (fallback)
 */
const formatPropertyKeys = (
  keys: ReadonlyArray<keyof ScampElement>
): string => {
  if (keys.length === 0) return 'styles';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const label = FIELD_LABELS[key as string] ?? String(key);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.join(', ');
};

/**
 * Generate the human-readable label for a history entry. Pure
 * function of the entry plus the LIVE elements map — that's how
 * retroactive renames work.
 */
export const formatHistoryLabel = (
  entry: HistoryEntry,
  elements: Record<string, ScampElement>
): string => {
  const firstId = entry.elementIds[0];
  const firstName = firstId
    ? resolveElementName(elements, firstId, '[deleted]')
    : '';

  switch (entry.kind) {
    case 'draw-rect':
      return 'Drew rectangle';
    case 'add-text':
      return 'Added text';
    case 'add-image':
      return 'Added image';
    case 'add-input':
      return 'Added input';
    case 'add-component-instance': {
      // The element's `componentName` carries the human-readable
      // identifier for the placed instance. Fall back to `firstName`
      // (which becomes `inst_<hex>`) if for some reason the element
      // has already been removed from the live map.
      const live =
        firstId !== undefined ? elements[firstId] : undefined;
      const label = live?.componentName ?? firstName;
      return `Placed ${label}`;
    }
    case 'convert-to-component': {
      const live =
        firstId !== undefined ? elements[firstId] : undefined;
      const label = live?.componentName ?? firstName;
      return `Converted to ${label}`;
    }
    case 'detach-instance': {
      // After detach the live element is no longer a component-
      // instance — it's the cloned root. previousName captures the
      // component name from the dialog so the label reads
      // "Detached Button".
      return `Detached ${entry.previousName ?? 'instance'}`;
    }
    case 'delete': {
      // After deletion the element is gone from the live map.
      // Prefer the captured previousName for a sensible label.
      const live = firstId !== undefined && elements[firstId] !== undefined;
      const name = live ? firstName : entry.previousName ?? '[deleted]';
      return `Deleted ${name}`;
    }
    case 'delete-contents':
      // The element itself survives — only its children / raw fragments /
      // text were cleared — so `firstName` still resolves from the live map.
      return `Cleared contents of ${firstName}`;
    case 'move':
      return `Moved ${firstName}`;
    case 'resize':
      return `Resized ${firstName}`;
    case 'patch':
      return `Changed ${formatPropertyKeys(entry.propertyKeys ?? [])} — ${firstName}`;
    case 'raw-css':
      return `Edited styles — ${firstName}`;
    case 'rename':
      return `Renamed ${entry.previousName ?? '?'} to ${firstName}`;
    case 'rename-page':
      return `Renamed page ${entry.previousName ?? '?'} to ${entry.pageName ?? '?'}`;
    case 'add-page':
      return `Added page ${entry.pageName ?? '?'}`;
    case 'delete-page':
      return `Deleted page ${entry.pageName ?? '?'}`;
    case 'cut': {
      // Like 'delete', the elements are gone by the time this renders.
      const live = firstId !== undefined && elements[firstId] !== undefined;
      const name = live ? firstName : entry.previousName ?? '[cut]';
      return `Cut ${name}`;
    }
    case 'paste':
      return `Pasted ${firstName}`;
    case 'duplicate':
      return `Duplicated ${firstName}`;
    case 'group':
      return 'Grouped elements';
    case 'ungroup':
      return 'Ungrouped elements';
    case 'wrap-link':
      return `Wrapped ${firstName} in <a>`;
    case 'reorder':
      return `Reordered ${firstName}`;
    case 'toggle-group': {
      const group = entry.toggleGroup ?? 'group';
      // Title-case the group label for prose readability:
      // 'shadow' → 'Shadow', 'blend' → 'Blend'.
      const label = group.charAt(0).toUpperCase() + group.slice(1);
      const verb = entry.toggleGroupOn ? 'Showed' : 'Hid';
      return `${verb} ${label} — ${firstName}`;
    }
    case 'external-edit':
      return 'External edit detected';
    case 'agent-edit':
      return 'Scamp Agent edit';
    case 'load':
      return 'Initial state';
  }
};

/**
 * Format a wall-clock timestamp as a relative string for the
 * history panel.
 *
 *   < 30s   → "just now"
 *   < 60s   → "30 sec ago"
 *   < 60 min → "N min ago"
 *   < 24h   → "N hr ago"
 *   ≥ 24h   → absolute HH:MM
 */
export const formatRelativeTime = (ts: number, now: number): string => {
  const ms = now - ts;
  if (ms < 30_000) return 'just now';
  if (ms < 60_000) return '30 sec ago';
  if (ms < 60 * 60_000) {
    const mins = Math.floor(ms / 60_000);
    return `${mins} min ago`;
  }
  if (ms < 24 * 60 * 60_000) {
    const hrs = Math.floor(ms / (60 * 60_000));
    return `${hrs} hr ago`;
  }
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
};
