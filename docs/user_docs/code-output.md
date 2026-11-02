# Code output

Scamp generates real, production-ready code files as you design.

## What Scamp generates

Each page produces two files:

- `pagename.tsx`: A React component with JSX markup.
- `pagename.module.css`: A CSS Module with scoped class names.

A page whose design is a [view](views.md) keeps the same two files
under `views/[Name]/`, and the page file becomes a one-line wrapper.

### TSX structure

```tsx
<div data-scamp-id="root" className={styles.root}>
  <nav data-scamp-id="rect_a1b2" className={styles.rect_a1b2}>
    <a
      data-scamp-id="text_l1n2"
      className={styles.text_l1n2}
      href="/about"
      target="_self"
    >
      About
    </a>
  </nav>
</div>
```

- Each element gets a `data-scamp-id` attribute that matches its CSS
  class name.
- Class names follow the pattern `prefix_shortid`, where the prefix is
  `rect_`, `text_`, `img_`, or `input_`.
- The HTML tag is whatever you chose in the Element section; Scamp emits
  it directly. See [Elements](elements.md).
- Tag-specific attributes (`href`, `target`, `controls`, `placeholder`,
  and so on) round-trip exactly as written.

### CSS structure

Scamp emits only the properties that differ from the defaults. An
element with a white background and no border produces minimal CSS:

```css
.rect_a1b2 {
  width: 200px;
  height: 100px;
}
```

Unknown CSS properties, whether added through the CSS editor or outside
Scamp, are preserved as custom properties and round-trip through saves.

### Responsive overrides

Styles you set while a non-desktop [breakpoint](breakpoints.md) is
active land inside `@media (max-width: Npx)` blocks at the bottom of the
CSS module, widest first:

```css
.rect_a1b2 {
  width: 100%;
  padding: 24px;
}

@media (max-width: 768px) {
  .rect_a1b2 {
    padding: 12px;
  }
}

@media (max-width: 390px) {
  .rect_a1b2 {
    padding: 8px;
  }
}
```

Unknown `@media` queries, such as `min-width` and `prefers-color-scheme`,
are preserved exactly as written after the known breakpoint blocks.

## Views and components

A [view](views.md) or a [component](components.md) is a function with
a props type, and its file ends with a `_scamp` export:

```tsx
import styles from './Lobby.module.css';

type LobbyProps = {
  code?: string;
  players?: Array<{ id: string; label: string }>;
  waiting?: boolean;
  onStart?: () => void;
  className?: string;
};

export default function Lobby({
  code = "KZQ4",
  players = [
    { id: "1", label: "Player 1 · Alex" },
    { id: "2", label: "Player 2 · Bea" },
  ],
  waiting = true,
  onStart,
  className,
}: LobbyProps) {
  return (
    <div data-scamp-id="root" className={`${styles.root} ${className ?? ''}`}>
      <h2 data-scamp-id="code_e1d2" className={styles.code_e1d2}>{code}</h2>
      {players.map((player) => (
        <p data-scamp-id="row_e1e4" className={styles.row_e1e4} key={player.id}>{player.label}</p>
      ))}
      {waiting && (
        <p data-scamp-id="note_e1f5" className={styles.note_e1f5}>Waiting for everyone to join</p>
      )}
      <button data-scamp-id="start_e1f9" className={styles.start_e1f9} type="button" onClick={onStart}>Start the game</button>
    </div>
  );
}

export const _scamp = { contract: 0, events: ['onStart'] } as const;
```

- Every prop is optional, and the default in the destructure is the
  sample value from the Data tab. The file renders on its own with no
  data.
- Props are declared in the order they appear in the design, then event
  handlers, then slots, then `className`.
- The `_scamp` export records the file format version (the contract)
  and the event props in order. Scamp writes it on every save.

Each binding from the Data tab has one form in the file, and Scamp
reads only these forms back:

| Binding | In the file |
|---|---|
| Text | `{code}` in place of the literal |
| Attribute | `href={url}`; a boolean attribute is `disabled={canStart}` or `disabled={!canStart}` |
| Event | `onClick={onStart}`; inside a repeat, `onClick={() => onCopy?.(player.id)}` |
| Repeat | `{players.map((player) => (` … `))}` around one element, which carries `key={player.id}` |
| Show | `{waiting && (` … `)}` around one element |

Inside a repeat, `{player.label}` and `href={player.url}` read the
row. Any other expression in an attribute is kept as written but isn't
editable on the canvas.

## Live code preview

The bottom panel shows a read-only preview of the generated TSX and CSS
for the current page. It updates as you make changes on the canvas.

Selecting an element highlights it in both panes and scrolls it into
view: its JSX tag on the left, and every CSS rule that styles it on the
right, including state variants like `:hover` and any `@media`
overrides. Selecting a [component instance](components.md) highlights
only the TSX, because instances have no CSS class of their own.

To make the panel taller or shorter, drag its top edge. Double-click the
edge to return to the default height. The code panel and the
[terminal](terminal.md) share one height.

## Save status

An indicator in the toolbar tracks whether the canvas is in sync with
disk:

| State | Meaning |
|---|---|
| **✓ Saved** | The canvas matches what's on disk. |
| **↑ Saving…** | A debounced write is in progress. |
| **● Unsaved** | You made edits, and the debounce hasn't fired yet. |
| **⚠ Save failed** | The last write failed. Click **Retry** to try again. |

Most of the time you see only **Saved**: writes happen in about 200 ms
and succeed silently.

## Sync behavior

- **Debounced writes**: Scamp waits briefly after your last change before
  writing to disk, which avoids excessive file I/O.
- **Atomic file writes**: Scamp writes files atomically, so external
  tools never read a partial file.
- **Background format migrations**: When Scamp opens an older project
  that uses the pre-canvas-rework root sizing, it silently rewrites
  `.root` to the new format on first open. A one-time banner tells you.

For external editing, see [Bidirectional sync](bidirectional-sync.md).
