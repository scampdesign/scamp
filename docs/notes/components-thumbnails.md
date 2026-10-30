---
title: Component sidebar thumbnails
related:
  - src/renderer/src/lib/componentThumbnail.ts
  - src/renderer/src/syncBridge.ts
  - src/renderer/src/components/ComponentSidebarItem.tsx
  - src/main/ipc/componentOps.ts
  - src/main/ipc/projectScaffold.ts
---

# Component sidebar thumbnails

Every successful component save captures a small PNG of the canvas and writes it under `<projectPath>/.scamp/component-thumbs/<Name>.png`. The sidebar component list renders each thumbnail next to the name; components that have never been saved (or which the user hasn't opened yet) show a dashed-box placeholder.

## Capture pipeline

1. `syncBridge.writeIfDirty` finishes its `dispatchPageWrite` for a `target.kind === 'component'`.
2. We `requestAnimationFrame(...)` so the canvas commits the latest paint before `html-to-image` rasterises it.
3. `captureAndPersistComponentThumbnail` finds the default frame of the variant set (`[data-variant-cell=""] [data-variant-frame]`) when the component has variants, else the `[data-testid="canvas-frame"]` node. Capturing the whole set cloned every frame's computed styles: about 3.5 seconds of blocked UI per save for a 36-frame set. It reads its intrinsic `offsetWidth/Height` (the helper internally resets `transform: scale` for the duration so output matches the design size, not the visible zoom), and calls `capturePng({ scale: 1 })`.
4. Ships the data URL via `window.scamp.writeComponentThumbnail`.
5. Main decodes the base64 PNG and writes it under `.scamp/component-thumbs/<Name>.png`, creating the directory tree if missing.
6. On success, the renderer dispatches a `scamp:component-thumbnail-updated` custom event so the sidebar's `ComponentSidebarItem` can re-fetch and refresh its `<img>` source.

## Why the custom event (not chokidar)

The project file watcher has `ignored: [/(^|[\/\\])\../, ...]` which excludes any dotfile-prefixed path — including everything under `.scamp/`. That's deliberate: Scamp's own tooling artefacts (this, plus migration staging dirs) shouldn't trigger project re-reads. So chokidar will NOT fire a `file:changed` event when we write a thumbnail.

The custom event fills that gap. The sidebar item listens for it and reloads the thumbnail only when its own component name matches the event's detail — cheap, no broadcast spam.

## Throttling

`captureAndPersistComponentThumbnail` keeps an in-flight `Set<key>` of `<projectPath>::<componentName>`. A second save while the first is mid-capture is silently dropped; the next save picks up the latest state. The capture itself is fire-and-forget — failures log to `console.warn` but never block the underlying save.

## Storage layout + .gitignore

```
<projectPath>/
  .scamp/
    component-thumbs/
      Button.png
      Card.png
      …
```

Both scaffolds (Next.js + legacy) write a `.gitignore` containing `.scamp/`. `writeGitignoreIfMissing` skips when a `.gitignore` already exists so user customisations aren't clobbered. `projectMigrate` recognises `.gitignore` as a known file so the legacy→nextjs migration backs it up cleanly without surfacing it in `unmovedFiles`.

## Sidebar render

`ComponentSidebarItem` (used inside the `project.components.map` in `ProjectShell.tsx`) loads its thumbnail via the new `readComponentThumbnail` IPC on mount and on every matching `scamp:component-thumbnail-updated` event. Returns `base64: null` when the file doesn't exist; the component renders a dashed-box placeholder so row height stays consistent across the list.
