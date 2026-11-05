import { useEffect, useMemo, useRef, useState } from 'react';

import type { EmbeddedTreeNode } from '@shared/types';

import { useEmbeddedStore } from './embeddedStore';
import { hoverTreeNode, selectTreeNode } from './session';
import styles from './LayersPanel.module.css';

/** Levels a new page opens to: past body and the app's root, to its own layout. */
const OPEN_DEPTH = 4;

/** Ids from the root down to `id`, or null when it isn't in the tree. */
const pathTo = (node: EmbeddedTreeNode, id: string): string[] | null => {
  if (node.id === id) return [node.id];
  for (const kid of node.kids) {
    const below = pathTo(kid, id);
    if (below !== null) return [node.id, ...below];
  }
  return null;
};

type RowProps = {
  node: EmbeddedTreeNode;
  depth: number;
  open: ReadonlySet<string>;
  selected: string | null;
  onToggle: (id: string) => void;
};

const Row = ({ node, depth, open, selected, onToggle }: RowProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = open.has(node.id);
  const isSelected = selected === node.id;
  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);
  const firstClass = node.cls.split(' ')[0] ?? '';
  return (
    <>
      <div
        ref={ref}
        className={styles.row}
        style={{ paddingLeft: 6 + depth * 12 }}
        aria-selected={isSelected}
        role="treeitem"
        aria-expanded={node.kids.length > 0 ? isOpen : undefined}
        onMouseEnter={() => hoverTreeNode(node.id)}
        onMouseLeave={() => hoverTreeNode(null)}
        onClick={() => selectTreeNode(node.id)}
        data-testid="embedded-layer"
        data-tag={node.tag}
      >
        <button
          type="button"
          className={styles.twist}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          disabled={node.kids.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          {node.kids.length === 0 ? '' : isOpen ? '▾' : '▸'}
        </button>
        {node.comp !== null && <span className={styles.comp}>{node.comp}</span>}
        <span className={styles.tag}>{node.tag}</span>
        {firstClass.length > 0 && <span className={styles.cls}>.{firstClass}</span>}
        {node.text.length > 0 && <span className={styles.text}>{node.text}</span>}
      </div>
      {isOpen && node.kids.map((kid) => <Row key={kid.id} node={kid} depth={depth + 1} open={open} selected={selected} onToggle={onToggle} />)}
      {isOpen && node.more > 0 && (
        <div className={styles.more} style={{ paddingLeft: 18 + (depth + 1) * 12 }}>
          {node.more} more not shown
        </div>
      )}
    </>
  );
};

/** The page's elements as a tree, like DevTools' Elements panel: hover to outline, click to select. */
export const LayersPanel = (): JSX.Element => {
  const tree = useEmbeddedStore((s) => s.tree);
  const selected = useEmbeddedStore((s) => s.selection?.uid ?? null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const path = useMemo(() => (tree === null || selected === null ? null : pathTo(tree, selected)), [tree, selected]);

  // Open the way down to the selection, and the first levels of a new page.
  useEffect(() => {
    if (tree === null) return;
    setOpen((was) => {
      const next = new Set(was);
      const openTop = (node: EmbeddedTreeNode, depth: number): void => {
        if (depth >= OPEN_DEPTH) return;
        next.add(node.id);
        for (const kid of node.kids) openTop(kid, depth + 1);
      };
      openTop(tree, 0);
      for (const id of path?.slice(0, -1) ?? []) next.add(id);
      return next;
    });
  }, [tree, path]);

  const handleToggle = (id: string): void => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className={styles.panel} aria-label="Layers" data-testid="embedded-layers">
      <div className={styles.head}>Layers</div>
      <div className={styles.tree} role="tree">
        {tree === null ? (
          <p className={styles.empty}>The page’s elements appear here once it loads.</p>
        ) : (
          <Row node={tree} depth={0} open={open} selected={selected} onToggle={handleToggle} />
        )}
      </div>
    </aside>
  );
};
