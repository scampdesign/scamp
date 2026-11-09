import { useEffect, useMemo, useRef, useState } from 'react';

import type { EmbeddedTreeNode } from '@shared/types';
import { liftInTree, type TreeDrag as Drag } from '@lib/embeddedTree';

import { useEmbeddedStore } from './embeddedStore';
import { hoverTreeNode, moveTreeNode, selectTreeNode } from './session';
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

type Over = { id: string; position: 'before' | 'after' };

/** A row being dragged, and where it would land: shared down the tree. */
type DragProps = {
  drag: Drag | null;
  over: Over | null;
  /** False when there's nothing to move. */
  onDragStart: (id: string) => boolean;
  onDragOver: (over: Over | null) => void;
  onDrop: () => void;
  onDragEnd: () => void;
};

type RowProps = DragProps & {
  node: EmbeddedTreeNode;
  parentId: string | null;
  depth: number;
  open: ReadonlySet<string>;
  selected: string | null;
  onToggle: (id: string) => void;
};

const Row = (props: RowProps): JSX.Element => {
  const { node, parentId, depth, open, selected, onToggle, drag, over } = props;
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
        draggable={parentId !== null}
        onDragStart={(e) => {
          if (parentId === null || !props.onDragStart(node.id)) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', node.id);
        }}
        onDragOver={(e) => {
          // Only among siblings: moving into another parent isn't supported yet.
          if (drag === null || drag.parent !== parentId || drag.id === node.id) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          props.onDragOver({ id: node.id, position: e.clientY < r.top + r.height / 2 ? 'before' : 'after' });
        }}
        onDragLeave={() => {
          if (over?.id === node.id) props.onDragOver(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          props.onDrop();
        }}
        onDragEnd={props.onDragEnd}
        data-drop={over?.id === node.id ? over.position : undefined}
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
      {isOpen && node.kids.map((kid) => <Row {...props} key={kid.id} node={kid} parentId={node.id} depth={depth + 1} />)}
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const handleDragStart = (id: string): boolean => {
    if (tree === null) return false;
    const lifted = liftInTree(tree, id);
    setNote(
      lifted === null
        ? 'This layer and the ones around it have no siblings to move between.'
        : lifted.id !== id
          ? 'Moving the layer around it: this one has no siblings.'
          : null
    );
    setDrag(lifted);
    return lifted !== null;
  };
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
          <Row
            node={tree}
            parentId={null}
            depth={0}
            open={open}
            selected={selected}
            onToggle={handleToggle}
            drag={drag}
            over={over}
            onDragStart={handleDragStart}
            onDragOver={setOver}
            onDrop={() => {
              if (drag !== null && over !== null) moveTreeNode(drag.id, over.id, over.position);
              setDrag(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
          />
        )}
      </div>
      {/* Below the tree, so showing it mid-drag doesn't shift the rows. */}
      {note !== null && (
        <p className={styles.note} role="status" data-testid="embedded-layers-note">
          {note}
        </p>
      )}
    </aside>
  );
};
