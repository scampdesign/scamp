import {
  buildContextModel,
  type ContextChild,
  type ContextElement,
  type ContextInput,
  type ContextModel,
  type ContextTarget,
} from './contextModel';

/**
 * The live context file Scamp writes to `.scamp/context.md` — the open
 * target and the selected element, in markdown an agent can read at the
 * start of a turn instead of asking the user to describe what they clicked.
 *
 * A renderer over `contextModel`, nothing more. The facts live there so this
 * and the copy-context one-liner can't disagree.
 * see docs/archive/2026-08-05-live-context-file-plan.md
 */

// Re-exported so existing importers keep working unchanged.
export type { ContextInput, ContextTarget } from './contextModel';

const HEADER = `# Scamp Active Context

> This file is updated automatically by Scamp. Do not edit.
> It reflects the current canvas state as of the last interaction.`;

const childLine = (child: ContextChild): string => {
  const head = `- .${child.className} (${child.tag})`;
  if (child.kind === 'text') return `${head} — "${child.text ?? ''}"`;
  if (child.kind === 'instance') {
    return `${head} — instance of ${child.componentName ?? 'unknown component'}`;
  }
  if (child.childCount === 0) return head;
  return `${head} — ${child.childCount} ${
    child.childCount === 1 ? 'child' : 'children'
  }`;
};

const targetSection = (target: ContextTarget | null): string => {
  if (target === null) {
    return `## Active page\n\nNo project open.`;
  }
  const heading =
    target.kind === 'component'
      ? 'Active component'
      : target.kind === 'view'
        ? 'Active view'
        : 'Active page';
  const nameLine =
    target.kind === 'component'
      ? `Component: ${target.name}\n`
      : target.kind === 'view'
        ? `View: ${target.name}\n`
        : `Page: ${target.name}\n`;
  return `## ${heading}\n\n${nameLine}File: ${target.tsxPath}\nCSS:  ${target.cssPath}`;
};

const selectionSection = (el: ContextElement, extraSelected: number): string => {
  const lines = [
    `ID:      ${el.id}`,
    `Class:   .${el.className}`,
    `Tag:     ${el.tag}`,
  ];
  if (el.name !== undefined) lines.push(`Name:    ${el.name}`);
  if (el.parentClassName !== undefined) {
    lines.push(`Parent:  .${el.parentClassName}`);
  }
  // A flex ancestor is usually the answer to "why does this look wrong", so
  // the chain earns its line even though the brief only asked for children.
  if (el.chain.length > 0) lines.push(`Chain:   ${el.chain.join(' › ')}`);
  if (extraSelected > 0) {
    lines.push(
      `\n+${extraSelected} more element${extraSelected === 1 ? '' : 's'} also selected. The details above are for the primary selection.`
    );
  }
  return `## Selected element\n\n${lines.join('\n')}`;
};

const stylesSection = (el: ContextElement): string => {
  if (el.declarations.length === 0) {
    // Reachable when every declaration on the element is a custom property
    // — they're listed in their own section rather than repeated here.
    return `## Current styles\n\nNothing set through Scamp's canvas controls.`;
  }
  return `## Current styles\n\n${el.declarations.join('\n')}`;
};

const renderModel = (model: ContextModel): string => {
  const blocks: string[] = [HEADER, targetSection(model.target)];

  if (model.element === null) {
    blocks.push(`## Selected element\n\nNone selected.`);
  } else {
    const el = model.element;
    blocks.push(selectionSection(el, model.extraSelected));
    blocks.push(stylesSection(el));
    if (el.children.length > 0) {
      blocks.push(`## Children\n\n${el.children.map(childLine).join('\n')}`);
    }
    if (el.customProperties.length > 0) {
      blocks.push(
        `## Custom properties (not mapped to canvas controls)\n\n${el.customProperties
          .map(([prop, value]) => `${prop}: ${value};`)
          .join('\n')}`
      );
    }
  }

  blocks.push(
    `## Canvas size\n\n${model.canvasWidth}px wide / ${model.breakpointLabel} breakpoint`
  );

  return `${blocks.join('\n\n')}\n`;
};

/**
 * Render the whole file.
 *
 * Sections that would be empty are omitted rather than emitted with a
 * placeholder — an agent reading "Custom properties: none" learns nothing,
 * while an absent heading is unambiguous.
 */
export const buildContextMarkdown = (input: ContextInput): string =>
  renderModel(buildContextModel(input));
