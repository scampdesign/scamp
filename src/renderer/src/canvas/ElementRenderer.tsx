import {
  CSSProperties,
  ElementType,
  FocusEvent,
  KeyboardEvent,
  PointerEvent,
  type ReactNode,
  createElement,
  useEffect,
  useMemo,
  useRef, cloneElement } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { type FlexDirection, type ScampElement, ROOT_ELEMENT_ID } from '@lib/element';
import {
  childBindingKey,
  expandChildren,
  resolveAttr,
  resolveInstanceOverrides,
  resolveText,
  type BindingScope,
  type RowScope,
} from '@lib/bindingEval';
import { classNameFor, tagFor } from '@lib/generateCode';
import { isStyled, runClassName, runInlineStyle, runsOf, textFromRuns } from '@lib/textRuns';
// `svgSource` is JSX, because it is emitted into a .tsx file. The canvas
// is not React here — it injects the string as HTML — so it has to be
// converted back, or `style={{…}}` is an attribute named `style` whose
// value is `{{` and every line icon renders as a solid black blob.
// see docs/notes/import-parity-log.md
import { svgSourceToHtml } from '@lib/svgJsx';
import { selectionOffsetsWithin } from './textSelectionOffsets';
import { instanceClassPrefix } from '@lib/generateHtml';
import {
  CANVAS_SKIP_ATTRS_BY_TAG,
  canvasRenderTag,
  elementToStyle,
} from '@lib/elementToStyle';
import { DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { instanceStretchStyle } from '@lib/instanceStretch';
import { resolveElementAtBreakpoint } from '@lib/breakpointCascade';
import { resolveElementAtState } from '@lib/stateCascade';
import { formatAnimationShorthand } from '@lib/parsers';
import type { ThemeToken,
  ProjectFormat,
} from '@shared/types';
import { effectiveDisplay } from '@lib/effectiveDisplay';
import { sanitizeSvgInner } from '../lib/svg';
import { sanitizeInlineMarkup } from '../lib/inlineMarkup';
import { EMPTY_FRAME_MIN_HEIGHT } from './Viewport';
import styles from './ElementRenderer.module.css';

/** HTML void elements — React throws if createElement receives children for these. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

/** True iff root matches the blank-component scaffold (style-aware). see docs/notes/components-data-model.md */
const isScaffoldRoot = (root: ScampElement): boolean => {
  return (
    root.childIds.length === 0 &&
    root.inlineFragments.length === 0 &&
    root.backgroundColor === DEFAULT_ROOT_STYLES.backgroundColor &&
    root.widthMode === DEFAULT_ROOT_STYLES.widthMode &&
    root.heightMode === DEFAULT_ROOT_STYLES.heightMode &&
    root.borderWidth.every((v) => v === 0) &&
    root.borderRadius.every((v) => v === 0) &&
    root.padding.every((v) => v === 0) &&
    root.boxShadows.length === 0 &&
    root.opacity === DEFAULT_ROOT_STYLES.opacity &&
    root.minHeight === DEFAULT_ROOT_STYLES.minHeight
  );
};

type Props = {
  elementId: string;
  /** The repeat row this render is for; absent outside a repeat. */
  row?: RowScope;
};

const renderComponentSubtree = (
  element: ScampElement,
  elementsMap: Record<string, ScampElement>,
  parentDisplay: 'flex' | 'grid' | 'none' | undefined,
  parentDirection: FlexDirection | undefined,
  propOverrides: Record<string, string>,
  tokens: ReadonlyArray<ThemeToken>,
  projectDir: string | null,
  projectFormat: ProjectFormat,
  projectPath: string | null,
  /**
   * Threaded through every recursive call so the wrapper that
   * tags prop-text knows which instance owns the value. The
   * canvas hit-test and the prop-edit commit both key off this
   * id — without it, two instances of the same component on one
   * page would write into each other's overrides.
   */
  instanceId: string,
  /**
   * The owning instance's CSS class (`inst_a024`) — which is NOT the same
   * string as `instanceId` above, that being the raw canvas id (`a024`).
   * Used to prefix the component's class names so they match the prefixed
   * copy of the component's rules in the injected stylesheet.
   * see docs/notes/canvas-injected-stylesheet.md
   */
  instanceClass: string,
  /**
   * The current edit target, if any. When the recursion reaches
   * a text element whose `prop` matches AND whose owning instance
   * matches `instanceId`, that node renders as a contentEditable
   * span instead of a plain text node. Null when nothing is being
   * edited, or when an edit on a different instance is in flight.
   */
  editingProp: string | null,
  /**
   * Called when the user commits an edit (blur or Enter on the
   * contentEditable). Caller is responsible for clearing
   * `editingInstanceProp` after the commit.
   */
  onCommitProp: (propName: string, value: string) => void,
  /**
   * Called when the user enters edit mode on a prop-text (double-
   * click) or exits via Escape. The canvas store's
   * `setEditingInstanceProp` is the natural binding; the prop
   * is wrapped here so the renderer doesn't have to pull it from
   * the store at every node.
   */
  onChangeEditingProp: (propName: string | null) => void,
  /**
   * True when the owning instance is the current selection. Prop-text
   * only shows its dashed edit affordance while the instance is
   * selected — otherwise the page is noisy with outlines around every
   * editable string on every instance.
   */
  instanceSelected: boolean,
  /**
   * Render the page-instance's content for a slot marker. Called when the
   * recursion reaches a slot-marked rectangle in the definition; the
   * callback (closing over the page instance) returns the instance's
   * page-owned slot children (or an empty drop zone). see
   * docs/plans/component-slots-plan.md
   */
  renderSlot: (slotName: string) => {
    content: JSX.Element | JSX.Element[];
    empty: boolean;
  },
  /** The repeat row this subtree is rendered for. see docs/notes/view-bindings.md */
  row: RowScope | null = null
): JSX.Element | null => {
  const scope: BindingScope = {
    samples: elementsMap[ROOT_ELEMENT_ID]?.samples ?? {},
    row,
  };
  // Slot composition deferred: nested instances render as placeholders.
  if (element.type === 'component-instance') {
    return (
      <div
        key={element.id}
        style={{
          padding: '4px 8px',
          background: 'rgba(99, 102, 241, 0.12)',
          border: '1px dashed var(--accent, #6366f1)',
          borderRadius: 4,
          color: 'var(--text-secondary)',
          fontSize: 12,
        }}
      >
        Nested {element.componentName}
      </div>
    );
  }
  const style = elementToStyle(
    element,
    parentDisplay,
    parentDirection,
    tokens,
    projectDir,
    projectFormat,
    // Inner subtree: strip page-canvas-only affordances (the
    // 900px EMPTY_FRAME_MIN_HEIGHT floor, the
    // "root drops fixed height" behaviour) so the component's
    // root renders at its real designed size, not as a
    // full-canvas-sized white box.
    true,
    // rootMinHeight is unused when isInstanceInner is true; pass the
    // page-canvas floor to satisfy the (now required) param.
    EMPTY_FRAME_MIN_HEIGHT
  );
  const storedTag = tagFor(element);
  const tag = canvasRenderTag(storedTag) as ElementType;
  const className = classNameFor(element);

  const props: Record<string, unknown> = {
    'data-scamp-id': className,
    // Same UA-chrome reset the page / component-editor renderer applies.
    // Without it a `button` / `a` / `input` inside an instance keeps its
    // browser-default colour, font and border, while the identical element
    // in the component editor gets `all: unset` — so an instance renders
    // system-button grey where the definition renders the designed styles.
    // Prefixed by the owning instance, not bare. Inside an instance these
    // are the COMPONENT's class names, and a bare `root` would be matched
    // by the PAGE's `.root` rule in the injected stylesheet — CSS Modules
    // keep the two apart on disk and the prefix does it here. The sheet
    // carries a matching prefixed copy of the component's rules.
    // see docs/notes/canvas-injected-stylesheet.md
    className: `${styles.element} ${instanceClassPrefix('', instanceClass)}${className}`,
    style,
  };
  // Forward agent-written attributes through the same per-tag deny
  // list the page renderer uses (no href navigation, no form
  // action, etc.).
  if (element.attributes) {
    const skip = CANVAS_SKIP_ATTRS_BY_TAG[storedTag] ?? new Set<string>();
    for (const [name, value] of Object.entries(element.attributes)) {
      if (skip.has(name)) continue;
      props[name] = value === '' ? true : value;
    }
  }

  // <img> src/alt routing — same `scamp-asset://` rewrite as the
  // page renderer so component-defined images load correctly on
  // the canvas preview.
  if (element.type === 'image' && storedTag === 'img') {
    let resolvedSrc = resolveAttr(element, 'src', scope) ?? element.src ?? '';
    if (projectPath && resolvedSrc.startsWith('./')) {
      const absPath = `${projectPath.replace(/\\/g, '/')}/${resolvedSrc.slice(2)}`;
      resolvedSrc = `scamp-asset://localhost/${encodeURI(absPath.replace(/^\/+/, ''))}`;
    } else if (
      projectPath &&
      projectFormat !== 'legacy' &&
      resolvedSrc.startsWith('/')
    ) {
      const absPath = `${projectPath.replace(/\\/g, '/')}/public${resolvedSrc}`;
      resolvedSrc = `scamp-asset://localhost/${encodeURI(absPath.replace(/^\/+/, ''))}`;
    }
    props['src'] = resolvedSrc;
    props['alt'] = resolveAttr(element, 'alt', scope) ?? element.alt ?? '';
  }

  if (VOID_TAGS.has(tag as string)) {
    return createElement(tag, { ...props, key: element.id });
  }

  // SVG inside a component instance renders its real (sanitized) source
  // too, so instances on the page match the component definition. Use a
  // real <svg> element (NOT canvasRenderTag, which maps svg→div for the
  // legacy placeholder) so the shapes render in the SVG namespace and
  // the element-level fill/stroke recolour them.
  if (storedTag === 'svg') {
    return createElement('svg', {
      ...props,
      key: element.id,
      dangerouslySetInnerHTML: {
        __html: sanitizeSvgInner(svgSourceToHtml(element.svgSource ?? '')),
      },
    });
  }

  const isText = element.type === 'text';
  // Substitute propOverride → literal default for prop-text. A row-bound
  // text (`player.label`) resolves from the row instead and isn't an
  // editable prop. see docs/notes/components-data-model.md
  const rowText = resolveText(element, scope);
  const propName =
    rowText === undefined && isText && typeof element.prop === 'string' && element.prop.length > 0
      ? element.prop
      : null;
  const overrideValue =
    propName !== null ? propOverrides[propName] : undefined;
  const defaultText =
    isText && typeof element.text === 'string' ? element.text : undefined;
  const textContent: string | undefined =
    rowText !== undefined
      ? rowText
      : overrideValue !== undefined
        ? overrideValue
        : defaultText;

  const hasText =
    isText && typeof textContent === 'string' && textContent.length > 0;
  const hasChildren = element.childIds.length > 0;

  // Prop-text always carries the hit-test attrs and overrides the
  // inner wrapper's `pointer-events: none` so `elementsFromPoint`
  // surfaces it for `propTextHitTest`. The dashed edit affordance
  // only shows once the owning instance is selected — otherwise a
  // page full of instances would be noisy with outlines around
  // every editable string. The affordance lives on a CSS-module
  // class so PNG / SVG export can strip it the same way it strips
  // `.selected`.
  const isEditingThisProp = propName !== null && editingProp === propName;
  if (isText && propName !== null) {
    props['data-scamp-instance-id'] = instanceId;
    props['data-scamp-prop'] = propName;
    // `props.style` is still the `style` local here (only attrs/src/alt
    // are written above), so read the typed CSSProperties directly
    // rather than casting the `unknown`-valued bag entry.
    props['style'] = { ...style, pointerEvents: 'auto' };
    if (instanceSelected) {
      const existing =
        typeof props['className'] === 'string' ? props['className'] : '';
      props['className'] = existing
        ? `${existing} ${styles.propEditAffordance}`
        : styles.propEditAffordance;
    }
  }
  // Locked text on an instance — hint via native tooltip.
  if (isText && propName === null) {
    props['title'] = 'Locked text — edit in the component definition.';
  }

  // Slot marker: render THIS rect's own styled div (the slot's box) with
  // the page instance's slot content as its children. Checked BEFORE the
  // no-children short-circuit because a slot rect has no definition
  // children of its own. Marks the box as a drop target + re-enables
  // pointer events so content is selectable. Matches the generated
  // `<slotRect>{children}</slotRect>`. see docs/plans/component-slots-plan.md
  if (typeof element.slot === 'string' && element.slot.length > 0) {
    const { content } = renderSlot(element.slot);
    return createElement(
      tag,
      {
        ...props,
        key: element.id,
        'data-scamp-slot': element.slot,
        'data-slot-owner-id': instanceId,
        style: { ...style, pointerEvents: 'auto' },
      },
      content
    );
  }

  if (!hasChildren && !hasText && !isEditingThisProp) {
    return createElement(tag, { ...props, key: element.id });
  }
  if (isEditingThisProp && propName !== null) {
    const handleBlur: import('react').FocusEventHandler<HTMLElement> = (e) => {
      const next = e.currentTarget.textContent ?? '';
      onCommitProp(propName, next);
    };
    const handleKeyDown: import('react').KeyboardEventHandler<HTMLElement> = (
      e
    ) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onChangeEditingProp(null);
      } else if (e.key === 'Enter') {
        // Enter commits (line breaks need explicit \n escape, not surfaced).
        e.preventDefault();
        const next = (e.currentTarget as HTMLElement).textContent ?? '';
        onCommitProp(propName, next);
      }
    };
    return createElement(
      tag,
      {
        ...props,
        key: element.id,
        contentEditable: true,
        suppressContentEditableWarning: true,
        spellCheck: false,
        onBlur: handleBlur,
        onKeyDown: handleKeyDown,
        ref: (node: HTMLElement | null) => {
          // Focus + select-all on mount.
          if (!node) return;
          node.focus({ preventScroll: true });
          const range = document.createRange();
          range.selectNodeContents(node);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        },
      },
      textContent ?? ''
    );
  }
  if (hasText && !hasChildren) {
    return createElement(tag, { ...props, key: element.id }, textContent);
  }

  // Derive parent display / direction once so children's
  // elementToStyle behaves correctly inside flex / grid parents.
  // `inline-flex` / `inline-grid` live in customProperties, so the
  // typed field alone answers "no" for a container that plainly does
  // lay its children out. see `effectiveDisplay`
  const ownDisplay = effectiveDisplay(element);
  const childParentDisplay =
    ownDisplay === 'flex' || ownDisplay === 'grid' ? ownDisplay : 'none';
  const childParentDirection = ownDisplay === 'flex' ? element.flexDirection : undefined;

  const children = expandChildren(elementsMap, element.childIds, scope)
    .map(({ id: childId, row: childRow }) => {
      const child = elementsMap[childId];
      if (!child) return null;
      const rendered = renderComponentSubtree(
        child,
        elementsMap,
        childParentDisplay,
        childParentDirection,
        propOverrides,
        tokens,
        projectDir,
        projectFormat,
        projectPath,
        instanceId,
        instanceClass,
        editingProp,
        onCommitProp,
        onChangeEditingProp,
        instanceSelected,
        renderSlot,
        childRow
      );
      // A repeated child renders once per row; React needs a key per copy.
      return rendered && childRow !== null
        ? cloneElement(rendered, { key: `${childId}:${childRow.index}` })
        : rendered;
    })
    .filter((c): c is JSX.Element => c !== null);

  return createElement(tag, { ...props, key: element.id }, children);
};

export const ElementRenderer = ({ elementId, row }: Props): JSX.Element | null => {
  const rawElement = useCanvasStore((s) => s.elements[elementId]);
  // Bindings resolve against the root's samples and the current row.
  // see docs/notes/view-bindings.md
  const rootSamples = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.samples);
  const childBindings = useCanvasStore((s) => {
    const el = s.elements[elementId];
    return el ? childBindingKey(s.elements, el.childIds) : '';
  });
  const scope: BindingScope = { samples: rootSamples ?? {}, row: row ?? null };
  // A copy of a repeated element beyond the first is display only: it
  // carries no hit-test id or ref, so selection and measurement land on
  // the first copy.
  const isRepeatCopy = row !== undefined && row.index > 0;
  const activeBreakpointId = useCanvasStore((s) => s.activeBreakpointId);
  const activeStateName = useCanvasStore((s) => s.activeStateName);
  const breakpoints = useCanvasStore((s) => s.breakpoints);
  const isSelected = useCanvasStore((s) => s.selectedElementIds.includes(elementId));
  // Resolve overrides at render time. Selected elements get the
  // active state's overrides layered in (the state switcher *is* the
  // canvas preview); non-selected elements always render their
  // default state. When nothing applies, this is a no-op identity
  // return.
  const previewState =
    isSelected && activeStateName !== null ? activeStateName : null;
  const element = rawElement
    ? resolveElementAtState(
        rawElement,
        activeBreakpointId,
        breakpoints,
        previewState
      )
    : undefined;
  // Parent resolution doesn't carry a state preview — only the
  // selected element previews its hover/active/focus styles. The
  // parent's layout (flex / grid behaviour) is whatever the
  // breakpoint cascade resolves.
  const parentResolved = useCanvasStore((s) => {
    const el = s.elements[elementId];
    if (!el || !el.parentId) return undefined;
    const parent = s.elements[el.parentId];
    if (!parent) return undefined;
    return resolveElementAtBreakpoint(parent, s.activeBreakpointId, s.breakpoints);
  });
  // Slot content (an element whose parent is a component-instance) flows
  // inside the slot rather than being absolutely positioned by its page
  // x/y — otherwise it renders at its old page coordinates, escaping the
  // slot. Treat the instance parent as a flex column so children stack.
  // see docs/plans/component-slots-plan.md
  const parentIsInstance = parentResolved?.type === 'component-instance';
  const parentDisplay = parentIsInstance ? 'flex' : effectiveDisplay(parentResolved);
  const parentDirection = parentIsInstance
    ? 'column'
    : parentResolved?.flexDirection;
  const themeTokens = useCanvasStore((s) => s.themeTokens);
  const projectFormat = useCanvasStore((s) => s.projectFormat);
  // Canvas-frame min height — page editor uses
  // EMPTY_FRAME_MIN_HEIGHT, component editor uses the
  // user-configured `componentCanvas[name].height`. ProjectShell
  // keeps this in sync with the active target. The root element
  // uses it as its own min-height so the root fills the visible
  // canvas regardless of content size.
  const canvasMinHeight = useCanvasStore((s) => s.canvasMinHeight);
  // In the component editor a fixed-height root keeps its own size instead of
  // filling the artboard. A page root always grows, and so does a view's: a
  // view is a page's design and gets the page canvas. see elementToStyle.
  const inComponentEditor = useCanvasStore((s) => s.activeComponent?.kind === 'component');
  // Canvas animation preview — set when the user clicks Play in the
  // AnimationSection. The matching element re-renders with a fresh
  // `key` so React forces a remount and the CSS animation plays
  // from the top. Non-matching elements never receive an animation
  // declaration on the canvas, so loops don't run during normal
  // editing — too distracting.
  const previewAnimation = useCanvasStore((s) =>
    s.previewAnimation?.elementId === elementId ? s.previewAnimation : null
  );
  const projectPath = useCanvasStore((s) => s.projectPath);
  const isEditing = useCanvasStore((s) => s.editingElementId === elementId);
  const setEditingElement = useCanvasStore((s) => s.setEditingElement);
  const setTextSelection = useCanvasStore((s) => s.setTextSelection);
  const setElementText = useCanvasStore((s) => s.setElementText);
  const selectElement = useCanvasStore((s) => s.selectElement);
  // Component-tree lookup for `component-instance` elements. The
  // selector is keyed by `componentName`, so a tree edit that
  // doesn't change THIS instance's component name is a no-op
  // re-render. When the element isn't an instance, the selector
  // returns undefined and React skips the deeper subscription.
  const componentTreeForInstance = useCanvasStore((s) => {
    const rawEl = s.elements[elementId];
    if (!rawEl || rawEl.type !== 'component-instance') return undefined;
    if (!rawEl.componentName) return undefined;
    return s.componentTrees[rawEl.componentName];
  });
  // The component's elements, resolved at the ACTIVE breakpoint. The
  // subtree used to render the definition's raw (desktop) fields, so an
  // inner root got an inline `width: fit-content` that masked its own
  // `@media` rule — the canvas showed the desktop size at Mobile while the
  // preview filled. Same cascade the page's own elements go through.
  // see docs/notes/components-data-model.md — "Instance wrapper sizing"
  const resolvedComponentElements = useMemo(() => {
    if (!componentTreeForInstance) return undefined;
    const out: Record<string, ScampElement> = {};
    for (const [id, el] of Object.entries(componentTreeForInstance.elements)) {
      out[id] = resolveElementAtBreakpoint(el, activeBreakpointId, breakpoints);
    }
    return out;
  }, [componentTreeForInstance, activeBreakpointId, breakpoints]);
  const requestComponentNavigation = useCanvasStore(
    (s) => s.requestComponentNavigation
  );
  // Phase 6: per-instance inline editing. The pair is non-null when
  // a prop-text inside SOME instance is in contentEditable mode.
  // The recursive subtree render compares the instance id to
  // decide whether to render the contentEditable form.
  const editingInstanceProp = useCanvasStore((s) => s.editingInstanceProp);
  const setEditingInstanceProp = useCanvasStore(
    (s) => s.setEditingInstanceProp
  );
  const setPropOverride = useCanvasStore((s) => s.setPropOverride);
  // The ref is attached to the element's DOM node — for text elements
  // it's the contentEditable target during edit mode.
  const elementRef = useRef<HTMLElement | null>(null);

  // Focus the editable region as soon as the element enters edit mode and
  // select all of its text so the user can immediately overwrite it.
  useEffect(() => {
    if (!isEditing) return;
    const node = elementRef.current;
    if (!node) return;
    // preventScroll: the element is inside a `transform: scale`d frame in
    // an overflow:auto container. Default focus() scrolls the element
    // into view, which on Mac visibly shifts the canvas and makes the
    // newly-placed text appear offset from where the user clicked.
    node.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [isEditing]);

  // While editing, a click anywhere outside the editable should commit and
  // exit. We trigger that by blurring the element, which fires the existing
  // onBlur handler.
  useEffect(() => {
    if (!isEditing) return;
    const handleDocPointerDown = (e: MouseEvent): void => {
      const node = elementRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      node.blur();
    };
    document.addEventListener('mousedown', handleDocPointerDown);
    return () => document.removeEventListener('mousedown', handleDocPointerDown);
  }, [isEditing]);

  if (!element) return null;

  const isText = element.type === 'text';
  const isImage = element.type === 'image';
  const isComponentInstance = element.type === 'component-instance';
  /**
   * Does this element hold more than its own words?
   *
   * A composed element renders children and inline markup as well as
   * text, the way `generateCode` writes it. It is also NOT editable in
   * place: `handleEditableBlur` commits `textContent`, which would
   * swallow every child's words into the parent's `text`.
   * see docs/notes/import-inline-spans.md
   */
  // A text element whose content is more than one run paints part of
  // itself differently, and the words have to be wrapped to do it —
  // which means it is composed for the same reason children and
  // fragments make it composed: `handleEditableBlur` commits
  // `textContent`, which would flatten every run into one.
  //
  // Styled runs do NOT make an element composed. Phase 3 had to treat
  // them that way because `handleEditableBlur` committed `textContent`
  // and would have flattened every run into one; the commit is now
  // run-aware, so a styled sentence is editable in place like any
  // other. see docs/plans/inline-spans-plan.md
  const runs = isText ? runsOf(element) : [];
  const hasStyledRuns = runs.length > 1 || runs.some(isStyled);
  const isComposed =
    element.childIds.length > 0 || element.inlineFragments.length > 0;
  const projectDir = projectPath ? projectPath.replace(/\\/g, '/') : null;
  const baseStyle = elementToStyle(
    element,
    parentDisplay,
    parentDirection,
    themeTokens,
    projectDir,
    projectFormat,
    false,
    canvasMinHeight,
    inComponentEditor
  );
  // When the canvas is previewing a non-default state for this
  // element, suppress transitions so the user sees the resolved end
  // state instantly rather than an animation halfway through.
  // Renderer-only — has no effect on the file on disk.
  let style =
    previewState !== null
      ? { ...baseStyle, transition: 'none' }
      : baseStyle;

  // Animation preview: when the user clicks Play, apply the resolved
  // animation as an inline declaration. Iteration is clamped to 1 so
  // even infinite loops play once on the canvas — preview should be a
  // single demonstration, not a perpetual distraction. `paused`
  // animations skip the preview entirely (the user explicitly
  // chose to pause). The React `key` on the element forces a remount
  // each Play click so the animation re-runs from the top.
  if (
    previewAnimation !== null &&
    element.animation &&
    element.animation.playState !== 'paused' &&
    !element.toggledOffGroups.includes('animation')
  ) {
    style = {
      ...style,
      animation: formatAnimationShorthand({
        ...element.animation,
        iterationCount: 1,
      }),
    };
  }
  // Component-instance render branch. Instances appear as a
  // single selectable element on the page tree; the visible
  // contents are the component definition's own element subtree,
  // rendered from `componentTrees[name].elements`. We wrap the
  // subtree in a positioned div that owns selection / double-
  // click / context-menu, and apply `pointer-events: none` to
  // the inner subtree so every click lands on the wrapper.
  //
  // Double-click navigates the canvas into the component editor
  // for this instance's component (one-shot request consumed by
  // `ProjectShell`'s `pendingComponentNavigation` effect).
  if (isComponentInstance) {
    const handleInstanceClick = (
      e: import('react').MouseEvent<HTMLElement>
    ): void => {
      e.stopPropagation();
      selectElement(element.id);
    };
    const handleInstanceDoubleClick = (
      e: import('react').MouseEvent<HTMLElement>
    ): void => {
      e.preventDefault();
      e.stopPropagation();
      const name = element.componentName;
      if (name) requestComponentNavigation(name);
    };
    const handleInstanceContextMenu = (
      e: import('react').MouseEvent<HTMLElement>
    ): void => {
      e.preventDefault();
      e.stopPropagation();
      selectElement(element.id);
      window.dispatchEvent(
        new CustomEvent('scamp:open-element-context-menu', {
          detail: { x: e.clientX, y: e.clientY, elementId: element.id },
        })
      );
    };
    // The wrapper is an extra box that the generated page doesn't have, and
    // it's the thing that lays out where the component root would. A
    // component whose root is `stretch` must therefore stretch the WRAPPER,
    // or the root resolves `100%` against a content-sized box and collapses.
    // Translate stretch exactly the way `elementToStyle` does for a plain
    // element in the same slot (main axis → `flex: 1`, cross axis → the
    // per-axis rule), so an instance and an equivalent stretch rectangle lay
    // out identically. see docs/notes/components-data-model.md
    const instanceRoot =
      componentTreeForInstance && resolvedComponentElements
        ? resolvedComponentElements[componentTreeForInstance.rootId]
        : undefined;
    const wrapperProps = {
      'data-element-id': element.id,
      'data-scamp-instance-id': element.instanceId ?? '',
      className: `${styles.element} ${isSelected ? styles.selected : ''}`.trim(),
      style: {
        ...style,
        ...instanceStretchStyle(
          element.widthMode,
          element.heightMode,
          instanceRoot?.widthMode,
          instanceRoot?.heightMode,
          parentDisplay,
          parentDirection
        ),
      },
      onClick: handleInstanceClick,
      onDoubleClick: handleInstanceDoubleClick,
      onContextMenu: handleInstanceContextMenu,
    };
    // Missing-component placeholder (componentName not in cache).
    if (!componentTreeForInstance) {
      return (
        <div
          {...wrapperProps}
          style={{
            ...style,
            padding: '8px 12px',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px dashed #dc2626',
            borderRadius: 4,
            color: '#7f1d1d',
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
          }}
        >
          Missing component: {element.componentName ?? '(unnamed)'}
        </div>
      );
    }
    // The scaffold check reads the definition as written, not as resolved.
    const rawRoot = componentTreeForInstance.elements[componentTreeForInstance.rootId];
    const isEmptyComponent = rawRoot !== undefined && isScaffoldRoot(rawRoot);
    // A page-sized axis: the generated CSS puts the page's size on the
    // component ROOT (via the forwarded className, doubled selector). On
    // the canvas that size is on the WRAPPER, so the root must fill the
    // wrapper on that axis or it keeps hugging inside a box the page
    // sized. Resolved instance fields, so a per-breakpoint size counts.
    const root: ScampElement | undefined = instanceRoot
      ? {
          ...instanceRoot,
          ...(element.widthMode !== 'auto'
            ? { widthMode: 'stretch' as const, widthCustom: undefined }
            : {}),
          ...(element.heightMode !== 'auto'
            ? { heightMode: 'stretch' as const, heightCustom: undefined }
            : {}),
        }
      : undefined;
    // Only honour the edit target when it points at THIS instance.
    const editingPropForThis =
      editingInstanceProp && editingInstanceProp.instanceId === element.id
        ? editingInstanceProp.propName
        : null;
    const handleCommitProp = (propName: string, value: string): void => {
      setPropOverride(element.id, propName, value);
      setEditingInstanceProp(null);
    };
    const handleChangeEditingProp = (propName: string | null): void => {
      if (propName === null) {
        setEditingInstanceProp(null);
      } else {
        setEditingInstanceProp({ instanceId: element.id, propName });
      }
    };
    // Render this instance's content for a slot marker in the definition.
    // Phase 2: the instance's page-owned children fill the default slot,
    // rendered as real page elements (so they're selectable / editable).
    // "Default" = the `children` slot, or the sole slot when a component
    // has exactly one (even if renamed). Additional named slots show an
    // empty drop zone until Phase 3. see docs/plans/component-slots-plan.md
    const componentSlotCount = Object.values(
      componentTreeForInstance.elements
    ).filter((e) => typeof e.slot === 'string' && e.slot.length > 0).length;
    // Return the CONTENT that fills a slot (the instance's page-owned
    // children, or an empty-state label). `renderComponentSubtree` nests it
    // inside the slot RECT's own styled div, so the canvas matches the
    // generated `<slotRect>{children}</slotRect>`.
    const renderSlot = (
      slotName: string
    ): { content: JSX.Element | JSX.Element[]; empty: boolean } => {
      // Content is filtered to the slot it fills (via each child's
      // `slotName`; absent → the default `children` slot). A component with
      // exactly one slot takes all content regardless of name (so a single
      // renamed slot still fills).
      const pageElements = useCanvasStore.getState().elements;
      const contentIds = element.childIds.filter((id) => {
        if (componentSlotCount === 1) return true;
        const childSlot = pageElements[id]?.slotName;
        const effective = childSlot && childSlot.length > 0 ? childSlot : 'children';
        return effective === slotName;
      });
      if (contentIds.length === 0) {
        return {
          content: (
            <span key="slot-empty" className={styles.slotDropLabel}>
              Drop elements here
            </span>
          ),
          empty: true,
        };
      }
      return {
        content: contentIds.map((id) => (
          <ElementRenderer key={id} elementId={id} />
        )),
        empty: false,
      };
    };
    const inner =
      root && resolvedComponentElements
      ? renderComponentSubtree(
          root,
          resolvedComponentElements,
          // Pass page-side layout context so flex/grid still applies.
          parentDisplay,
          parentDirection,
          resolveInstanceOverrides(element, scope),
          themeTokens,
          projectDir,
          projectFormat,
          projectPath,
          element.id,
          classNameFor(element),
          editingPropForThis,
          handleCommitProp,
          handleChangeEditingProp,
          isSelected,
          renderSlot
        )
      : null;
    if (isEmptyComponent) {
      return (
        <div
          {...wrapperProps}
          style={{
            ...style,
            padding: '12px 16px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px dashed var(--accent, #6366f1)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
            minWidth: 80,
            minHeight: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {element.componentName ?? 'Component'} (empty — double-click to edit)
        </div>
      );
    }
    // The inner wrapper is a real `display: block` div (NOT
    // `display: contents`). `display: contents` makes the
    // wrapper transparent to layout, so percentage widths inside
    // the component leak up to the page root's containing block
    // — a component whose root has `width: 100%` then expands to
    // the full page canvas instead of hugging the instance
    // wrapper. With a real block in place, the component's
    // children resolve their percentage widths against the inner
    // div, which is itself content-sized, so `100%` falls back
    // to `auto` and the instance hugs its content as expected.
    return (
      <div {...wrapperProps}>
        <div
          style={{ pointerEvents: 'none', display: 'block' }}
          aria-hidden="true"
        >
          {inner}
        </div>
      </div>
    );
  }

  // The actual HTML tag — uses the element's stored override if any,
  // otherwise the type's default (`p` for text, `div` for rect).
  const storedTag = tagFor(element);
  const tag = canvasRenderTag(storedTag) as ElementType;

  const handleEditableBlur = (e: FocusEvent<HTMLElement>): void => {
    const next = e.currentTarget.textContent ?? '';
    // Unchanged words leave the runs alone. `setElementText` drops them
    // — it has to, because their offsets describe text that no longer
    // exists — so committing on every blur would strip the styling off
    // any sentence the user merely clicked into.
    if (next !== textFromRuns(runs)) setElementText(element.id, next);
    // The selection is deliberately NOT cleared. Blurring is how the
    // properties panel is reached, and a control that fires with no
    // range falls back to styling the whole element.
    setEditingElement(null);
  };

  /**
   * Remember what is selected, so the panel can style it.
   *
   * On key and pointer release rather than `selectionchange`: the
   * latter fires during a drag, and a half-made selection reaching the
   * panel makes every control flicker through values nobody chose.
   */
  const handleSelectionChange = (e: { currentTarget: HTMLElement }): void => {
    const offsets = selectionOffsetsWithin(e.currentTarget, window.getSelection());
    setTextSelection(offsets === null ? null : { elementId: element.id, ...offsets });
  };

  const handleEditableKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
    }
    // Allow Enter for line breaks; commit on blur instead.
  };

  // Build a single set of props for the dynamic-tag element. Text and
  // rectangle differ only in their children: text renders the element's
  // text directly inside (so the tag wraps the text the way real HTML
  // does), rectangles render their child elements recursively.
  const handleContextMenu = (
    e: import('react').MouseEvent<HTMLElement>
  ): void => {
    // Don't open a context menu while the user is mid-text-edit on
    // this element — the browser's native edit menu is more useful
    // there.
    if (isText && isEditing) return;
    e.preventDefault();
    e.stopPropagation();
    // Select the element so the properties panel switches to its
    // WYSIWYG view and the Export section's scope reflects the
    // right-clicked target.
    selectElement(element.id);
    window.dispatchEvent(
      new CustomEvent('scamp:open-element-context-menu', {
        detail: { x: e.clientX, y: e.clientY, elementId: element.id },
      })
    );
  };

  const props: Record<string, unknown> = {
    // `data-scamp-id` mirrors the CSS class name, matching what the code
    // generator writes to disk. `data-element-id` is the raw internal id
    // used by canvas hit-testing and selection — keep it separate so
    // renames don't force a refactor of every lookup site.
    'data-scamp-id': classNameFor(element),
    ...(isRepeatCopy && row !== undefined
      ? { 'data-scamp-repeat-copy': row.index }
      : { 'data-element-id': element.id }),
    onContextMenu: handleContextMenu,
    // Animation preview: increment the React key on each Play click
    // so React remounts the element and the CSS animation plays from
    // the top. Stays undefined when not previewing so we don't churn
    // the DOM during normal renders.
    ...(previewAnimation !== null
      ? { key: `preview-${previewAnimation.key}` }
      : {}),
    className: `${styles.element} ${classNameFor(element)} ${
      isSelected ? styles.selected : ''
    } ${isText && isEditing && !isComposed ? styles.textEditing : ''} ${
      element.visibilityMode === 'none' ? styles.hiddenNone : ''
    }`.trim(),
    style,
    ...(isRepeatCopy ? {} : { ref: elementRef }),
  };

  // Forward tag-specific attributes from the element's attribute bag
  // to the canvas DOM so the preview reflects them (e.g. input
  // placeholder, textarea rows, video controls). A small per-tag deny
  // list blocks attrs that would trigger side effects (navigation,
  // form submission) on the canvas.
  if (element.attributes) {
    const skip = CANVAS_SKIP_ATTRS_BY_TAG[storedTag] ?? new Set<string>();
    for (const [name, value] of Object.entries(element.attributes)) {
      if (skip.has(name)) continue;
      // Boolean attributes stored as "" map to React-style `true`.
      props[name] = value === '' ? true : value;
    }
  }

  // Interaction side-effects prevention for tags that would otherwise
  // navigate or submit. The canvas is a design surface, not a runtime.
  if (storedTag === 'a' || storedTag === 'button') {
    const prevOnClick = props['onClick'];
    props['onClick'] = (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      if (typeof prevOnClick === 'function') (prevOnClick as (ev: typeof e) => void)(e);
    };
  }

  if (isText && isEditing && !isComposed) {
    props['contentEditable'] = true;
    props['suppressContentEditableWarning'] = true;
    props['onBlur'] = handleEditableBlur;
    props['onKeyDown'] = handleEditableKeyDown;
    props['onKeyUp'] = handleSelectionChange;
    props['onMouseUp'] = handleSelectionChange;
    // Stop pointer events from bubbling so the user can place the
    // cursor / select text without triggering canvas interactions.
    props['onPointerDown'] = (e: PointerEvent<HTMLElement>) => e.stopPropagation();
  }

  // Only real `<img>` elements carry typed src/alt. Other media tags
  // (video, iframe, svg) store their src/title/etc. in the attribute
  // bag, which we've already spread above.
  if (isImage && storedTag === 'img') {
    // The element stores a path that makes sense at runtime: legacy
    // projects use `./assets/foo.png` (relative to the page file);
    // nextjs projects use `/assets/foo.png` (Next.js serves `public/`
    // at the URL root). In the Electron renderer neither resolves
    // against the project folder, so map both to the custom
    // `scamp-asset://` protocol registered in the main process.
    let resolvedSrc = resolveAttr(element, 'src', scope) ?? element.src ?? '';
    if (projectPath && resolvedSrc.startsWith('./')) {
      const absPath = `${projectPath.replace(/\\/g, '/')}/${resolvedSrc.slice(2)}`;
      resolvedSrc = `scamp-asset://localhost/${encodeURI(absPath.replace(/^\/+/, ''))}`;
    } else if (
      projectPath &&
      projectFormat !== 'legacy' &&
      resolvedSrc.startsWith('/')
    ) {
      // Nextjs absolute server-root path → `<project>/public/<path>`.
      const absPath = `${projectPath.replace(/\\/g, '/')}/public${resolvedSrc}`;
      resolvedSrc = `scamp-asset://localhost/${encodeURI(absPath.replace(/^\/+/, ''))}`;
    }
    props['src'] = resolvedSrc;
    props['alt'] = resolveAttr(element, 'alt', scope) ?? element.alt ?? '';
  }

  // Void HTML elements (img, input, br, hr, etc.) cannot have children
  // in React — even an empty array throws. Short-circuit for any void
  // tag so agent-written markup that uses <input />, <br />, etc.
  // renders without crashing.
  if (VOID_TAGS.has(tag as string)) {
    return createElement(tag, props);
  }

  // SVG: inject the stored inner source so the real artwork renders on
  // the canvas (not a placeholder box). Sanitized at this render sink so
  // even agent-written source can't execute. Must be a real <svg> element
  // (NOT canvasRenderTag, which maps svg→div for the legacy placeholder) —
  // otherwise the shapes land in the HTML namespace and don't paint. The
  // element-level fill/stroke then recolours the shapes inside.
  if (storedTag === 'svg') {
    return createElement('svg', {
      ...props,
      dangerouslySetInnerHTML: {
        __html: sanitizeSvgInner(svgSourceToHtml(element.svgSource ?? '')),
      },
    });
  }

  // Component slot marker (component editor): render the rectangle with a
  // dashed outline + a "✦ slot: <name>" label so the user can see it. A
  // slot has no children of its own — the label IS the content. The
  // `data-scamp-slot` attr is the drop-routing token Phase 2 hit-tests.
  // see docs/plans/component-slots-plan.md
  if (typeof element.slot === 'string' && element.slot.length > 0) {
    const baseClass =
      typeof props['className'] === 'string' ? props['className'] : '';
    return createElement(
      tag,
      {
        ...props,
        className: `${baseClass} ${styles.slot}`.trim(),
        'data-scamp-slot': element.slot,
      },
      createElement(
        'span',
        { className: styles.slotLabel, key: 'slot-label' },
        `✦ slot: ${element.slot}`
      )
    );
  }

  // Text, then inline markup and children interleaved by
  // `afterChildIndex` — the same order `generateCode` writes, because
  // the canvas and the file have to show the same thing. The canvas
  // used to render a text element's text and drop its children
  // entirely, so an imported paragraph's spans were listed in the
  // layers panel and drew nothing.
  const ownText = isText ? (resolveText(element, scope) ?? element.text ?? '') : '';
  let children: ReactNode | ReactNode[];
  if (hasStyledRuns && element.childIds.length === 0 && element.inlineFragments.length === 0) {
    // Styled runs and nothing else: render the words as spans carrying
    // each run's class. Only the STYLED ones get a wrapper — a plain
    // run is emitted bare, exactly as the generator writes it, so a
    // sentence with one coloured word is one span, not three.
    children = runs.map((run, index) =>
      isStyled(run)
        ? createElement(
            'span',
            {
              key: `run-${index}`,
              className: runClassName(classNameFor(element), index),
              style: runInlineStyle(run),
            },
            run.text
          )
        : run.text
    );
  } else if (!isComposed) {
    // The overwhelmingly common case, and the shape contentEditable
    // needs: a text element that is exactly its own words.
    children = ownText;
  } else {
    const composed: ReactNode[] = [];
    if (ownText.length > 0) composed.push(ownText);
    const fragmentsAt = (at: number): void => {
      element.inlineFragments.forEach((fragment, index) => {
        if (fragment.afterChildIndex !== at) return;
        if (fragment.kind === 'text') {
          composed.push(fragment.value);
          return;
        }
        // Verbatim source, so it has to be injected as markup to show
        // at all — the position the svg renderer is already in, and it
        // takes the same precaution. A fragment can come from a
        // hand-written file, so it is not trusted.
        const html = sanitizeInlineMarkup(fragment.source);
        if (html.length === 0) return;
        composed.push(
          createElement('span', {
            key: `fragment-${at}-${index}`,
            // A run inside a line, not a box of its own: `contents`
            // is the closest the canvas gets to the generator's
            // "emitted with no wrapper at all".
            style: { display: 'contents' },
            dangerouslySetInnerHTML: { __html: html },
          })
        );
      });
    };
    // `expandChildren` walks `childIds` in order, so each child's rows
    // are contiguous and a cursor is enough to keep fragment positions
    // lined up with the indices they were recorded against.
    const expanded = expandChildren(
      useCanvasStore.getState().elements,
      element.childIds,
      scope
    );
    let cursor = 0;
    fragmentsAt(-1);
    element.childIds.forEach((childId, index) => {
      while (cursor < expanded.length && expanded[cursor]?.id === childId) {
        const entry = expanded[cursor];
        cursor += 1;
        if (entry === undefined) continue;
        composed.push(
          <ElementRenderer
            key={entry.row !== null ? `${entry.id}:${entry.row.index}` : entry.id}
            elementId={entry.id}
            {...(entry.row !== null ? { row: entry.row } : {})}
          />
        );
      }
      fragmentsAt(index);
    });
    children = composed;
  }
  // `childBindings` is read so a child's show or repeat change re-expands
  // this list; the value itself is the subscription key.
  void childBindings;

  return createElement(tag, props, children);
};
