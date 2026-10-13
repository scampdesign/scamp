import {
  errorResult,
  textResult,
  type ToolDescriptor,
  type ToolInvoker,
  type ToolResult,
} from './protocol';
import {
  COMPONENT_NAME_RE,
  DEFAULT_COMPONENT_CSS,
  componentRelativePaths,
  defaultComponentTsx,
} from '../ipc/componentScaffold';

/**
 * The canvas tools an agent can call.
 *
 * Descriptions are written FOR THE MODEL, not for a human reader — they are
 * the only thing telling it when a tool is the right one, so they say when to
 * reach for it rather than restating the name. Schemas are strict
 * (`additionalProperties: false`) so a hallucinated argument fails loudly at
 * the boundary instead of being silently ignored.
 * see docs/plans/mcp-server-plan.md
 */

/** The tools that take no arguments. */
const NO_ARGS = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

/** Reads another view or component than the open one. */
const VIEW_ARG = {
  type: 'string',
  description:
    'A view or component name (scamp_list_pages `view`, scamp_list_components), or a view’s route slug. Omit for the one open on the canvas.',
} as const;

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'scamp_get_active_page',
    description:
      'The page, component, or view currently open on the Scamp canvas, with its project-relative TSX and CSS module paths. Call this first when you need to know which files the user is looking at. Check `kind`: `component` and `view` files carry a props type and end with the `_scamp` export.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_get_selected_element',
    description:
      'Full details of the element the user currently has selected: class, tag, parent, children, and its styles. Call this whenever the user says "this", "it", or "the selected element" instead of asking them to describe it. Returns null when nothing is selected.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_get_element_by_id',
    description:
      'Full details of any element by its Scamp id, whether or not it is selected. Use this to follow up on ids returned by scamp_get_element_tree or scamp_get_canvas_state. For a <table>, `tableRules` lists the rules Scamp derives from it — the subgrid carrying its columns to every row, and its row dividers, stripes, sticky header and cell padding — so check there before styling rows or cells one by one. Returns null if no such element exists.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The Scamp element id, e.g. "a1b2" (not the CSS class).',
        },
        view: VIEW_ARG,
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_get_element_tree',
    description:
      'The full element tree for the open page or component, or for any view or component named by `view` — ids, classes, and tags only, no styles. This is the cheap way to understand structure; follow up with scamp_get_element_by_id for the details of specific elements.',
    inputSchema: {
      type: 'object',
      properties: { view: VIEW_ARG },
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_get_canvas_state',
    description:
      'A broad snapshot: active target, selection, breakpoint, and every element with its styles. Large — prefer scamp_get_element_tree plus scamp_get_element_by_id unless you genuinely need everything at once. Element output is capped; a `truncated` field appears when it was.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_list_pages',
    description:
      'Every page in the project by route slug, with its project-relative file paths. Check `kind`: a `page` is a legacy app/<slug>/page.tsx; a `view` is the new shape — its design lives at views/<Name>/<Name>.tsx (`view` is that name) and the app/ file is a one-line wrapper Scamp owns. Edit the view, never the wrapper.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_list_components',
    description:
      'Every reusable Scamp component in the project (`components/<Name>/`) with its project-relative file paths. Read the returned .tsx file for a component’s props and markup. If this is empty and the user asks for components, a kit, or a library, create them — call scamp_get_component_scaffold for the starter files rather than building a page of examples.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_get_component_scaffold',
    description:
      'The exact starter TSX and CSS module for a new Scamp component, plus the project-relative paths to write them to. Call this before creating a component: when the user asks for components, a kit, or a library, write these folders under components/ rather than a page of examples. Scamp lists the component the moment the files exist. The name must be PascalCase letters and digits, e.g. "HeroCard".',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'PascalCase component name, e.g. "Card" or "HeroCard".',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_get_view_props',
    description:
      'The props a view or component accepts: the exact `<Name>Props` type as its file declares it, each prop’s kind (text, attribute, boolean, repeat, show, event, slot), the event names `_scamp.events` lists, and the sample data the design renders with. Call this before writing the route or page that renders a view so the object you pass matches exactly — the sample rows show the shape of a repeat’s list. Check `warnings`: a non-empty list means the view lost something on the way in and the props may not be the whole story — scamp_check_view explains each one. Takes the PascalCase name from scamp_list_pages (`view`) or scamp_list_components; a page’s route slug also works.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The view or component name, e.g. "Lobby", or a view page’s route slug, e.g. "lobby".',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_check_view',
    description:
      'What a page, view, or component LOST on the way into Scamp: bindings kept as opaque text, declarations that render but leave the panel controls blank, tokens theme.css does not declare, loose text that is not an editable element, sample rows that disagree, and tables built against the grain — an element in the wrong place in a table, a cell with its own width, a rowSpan, or a divider or padding repeated on every row or cell that belongs on the table once. Call this after writing or editing a view — a file can parse perfectly and still arrive degraded, and scamp_get_element_tree reports structure, so it looks correct in every one of those cases. `findings` are problems; an empty list means it arrived intact. `notes` are valid CSS the panel has no control for — they render correctly, so leave them: rewriting a value to clear a note changes the layout. Reads the files as they are now, so it works for any of them, open or not. Takes a view or component name, a view\u2019s route slug, or a plain page\u2019s name; scamp_check_project checks them all at once.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The view or component name, e.g. "Lobby", a view page\u2019s route slug, e.g. "lobby", or a plain page\u2019s name, e.g. "about".',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_check_project',
    description:
      'Run scamp_check_view on every page, view, and component in the project at once. Returns how many were checked, the counts of problems and notes, the ones with problems (pages first, then views, then components) with each finding, the ones with only notes, and any file that failed to parse. Notes are valid CSS the panel has no control for — leave them. Use it after a change that touched several files, after an import, or before handing work back, instead of checking each one by name. An empty `withFindings` list means the whole project is intact, whatever the notes say.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_list_routes',
    description:
      'Every file under routes/ in a Scamp-framework project: page routes with their URL pattern, render mode, and the view they render, and API routes (routes/api/**) with their URL. Call this before writing or editing a route, or to find which route renders a view; then read the file. Empty for a Next.js or legacy project.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_list_import_sources',
    description:
      "Views made by importing a web page, and where that page's ORIGINAL html and css are kept. An import is a lossy translation into Scamp's model, so the original is the only record of what the page actually said. Call this to find out whether a view you are asked to tidy up came from an import, then read the source with scamp_get_import_source. Empty when nothing has been imported this session — the originals are scratch and go when the project closes.",
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_get_import_source',
    description:
      "The original html or css of the page a view was imported from, before Scamp reduced it. Use it to answer 'what did the page actually do here?' — the authored rule behind a layout, a value the capture rounded, a selector the model has no place for — rather than inferring it from the generated output. Defaults to the css, which is where the answers usually are. Large files come back truncated; the reply carries the path on disk so you can read the rest with your own file tools.",
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The view name, as scamp_list_import_sources reports it.',
        },
        part: {
          type: 'string',
          enum: ['css', 'html'],
          description: "Which half to read. Defaults to 'css'.",
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_get_recent_edits',
    description:
      'What the designer has changed in Scamp, newest last: one entry per save, with the file, the line each change starts at, and the text that replaced what was there. Call it after the user says they changed something, or before editing a file you read earlier, so you work from what is on disk now. Pass the `revision` from a previous call as `since` to get only what happened after it; omit it for everything this session.',
    inputSchema: {
      type: 'object',
      properties: {
        since: {
          type: 'number',
          description: 'A `revision` from an earlier call. Only later saves are returned.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_get_conventions',
    description:
      "This project's own rules for writing its files, from the same source that writes agent.md — the layout, the class-name and id contract, the binding grammar, the CSS conventions, what Scamp regenerates. Call it with no arguments for the summary plus the list of section names, then again with `section` for the one you need. Prefer this over reading agent.md: it is scoped to the project's actual format, so it never describes a layout this project doesn't use.",
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description:
            'A section name from a previous call, e.g. "Route files", "HTML tags", "CSS properties". Matching ignores case and punctuation. Omit for the summary.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_get_theme_tokens',
    description:
      'The design tokens defined in the project’s theme.css, as a flat list of CSS custom properties, plus the available themes. Call this before writing any colour, spacing, or typography value so you use an existing token instead of a raw literal.',
    inputSchema: { ...NO_ARGS },
  },
  {
    name: 'scamp_get_react_source',
    description:
      'Read the React source an imported view or component came from — for a project made with Import a React app. With "element", the JSX around the line that drew it (marked >), with line numbers — where to find a condition (`{isLate && …}`, `a ? <B/> : <C/>`) or a list (`claims.map((claim) => …)`). Without it, which source files the view drew from and which of its elements each wrote. Words lifted into their own element have no line of their own: ask for their parent.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'The view or component, by name: "Patients".' },
        element: { type: 'string', description: 'An element, by id or class name. Omit for the overview.' },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_find_overflow',
    description:
      'Render a view or component the way its HTML export renders in a browser, and measure what overflows: elements past an edge of the page or widening it, elements outside their parent (shown, clipped, or scrolled to), and text wider than its box. Each finding names the element (and the component that owns it, for one inside an instance), how many px past which side, and its position. Use it to find overflow instead of guessing from styles, and again after fixing to check. Rows of a list share one finding. Measures what is saved, so write your edits before calling it.',
    inputSchema: {
      type: 'object',
      properties: {
        view: { ...VIEW_ARG, description: 'The view or component to measure. Omit for the one open on the canvas.' },
        width: {
          type: 'integer',
          description: 'The window width in px to lay it out at. Omit for the desktop width; pass a breakpoint’s width to check it there.',
        },
      },
      additionalProperties: false,
    },
  },
];

/** Names the invoker will accept — derived so the two can never drift. */
export const TOOL_NAMES: ReadonlyArray<string> = TOOL_DESCRIPTORS.map(
  (tool) => tool.name
);

/**
 * Serialise a tool's answer.
 *
 * JSON in a text block rather than `structuredContent`: every MCP client
 * understands text, and the shapes here are small enough to read directly.
 * `null` becomes an explicit sentence because a bare "null" reads as a
 * failure to a model, when it actually means "nothing is selected".
 */
const format = (
  tool: string,
  data: unknown,
  args: Record<string, unknown>
): ToolResult => {
  if (data === null || data === undefined) {
    if (tool === 'scamp_get_view_props' || tool === 'scamp_check_view') {
      return textResult(
        `No view or component named "${String(args['name'] ?? '')}" exists. Call scamp_list_pages (the \`view\` field) or scamp_list_components for the names.`
      );
    }
    if (tool === 'scamp_get_selected_element') {
      return textResult('No element is currently selected on the Scamp canvas.');
    }
    if (tool === 'scamp_get_element_by_id') {
      return textResult(
        args['view'] === undefined
          ? 'No element with that id exists on the open page.'
          : `No element with that id exists in ${String(args['view'])}.`
      );
    }
    if (tool === 'scamp_get_active_page') {
      return textResult('No project is currently open in Scamp.');
    }
    return textResult('null');
  }
  return textResult(JSON.stringify(data, null, 2));
};

const componentScaffoldResult = (name: unknown): ToolResult => {
  if (typeof name !== 'string' || !COMPONENT_NAME_RE.test(name)) {
    return errorResult(
      'scamp_get_component_scaffold requires a PascalCase "name" of letters and digits only, e.g. "HeroCard".'
    );
  }
  const paths = componentRelativePaths(name);
  return textResult(
    JSON.stringify(
      {
        name,
        files: [
          { path: paths.css, content: DEFAULT_COMPONENT_CSS },
          { path: paths.tsx, content: defaultComponentTsx(name) },
        ],
        note: 'Write both files (CSS first). Scamp lists the component in its sidebar as soon as they exist; no registration is needed. Then add elements inside the root exactly as you would on a page.',
      },
      null,
      2
    )
  );
};

/**
 * Build the invoker the protocol layer calls.
 *
 * `runQuery` is injected — in the app it's the renderer round trip, in tests
 * it's a stub. Keeping the boundary here is what lets the whole tool surface
 * be tested without an Electron window.
 */
export type ToolInvokerOptions = {
  /** Answers scamp_list_routes from disk; the routes aren't canvas state. */
  listRoutes?: () => Promise<unknown>;
  /**
   * scamp_check_view / scamp_check_project, read fresh from disk by the
   * renderer. Absent (the headless runner), they answer from the snapshot.
   */
  checks?: (tool: string, args: Record<string, unknown>) => Promise<{ ok: boolean; text: string }>;
  /** Imported pages' originals; they live in temp, not on the canvas. */
  listImportSources?: () => Promise<unknown>;
  readImportSource?: (
    view: string,
    part: 'css' | 'html'
  ) => Promise<{ text: string; truncated: boolean; path: string; url: string } | null>;
  /** A React import's source, read from the app's folder. */
  reactSource?: (
    target: string,
    element: string | undefined
  ) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  /** Lay a view out and measure what overflows. see docs/notes/agent-overflow-check.md */
  findOverflow?: (args: Record<string, unknown>) => Promise<{ ok: boolean; text: string }>;
};

/**
 * How much of an original one call returns.
 *
 * A stylesheet runs to megabytes and an agent's context does not. The
 * reply names the file, so the rest is one file read away for anything
 * that genuinely needs it.
 */
export const IMPORT_SOURCE_REPLY_LIMIT = 120_000;

export const createToolInvoker = (
  runQuery: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
  options: ToolInvokerOptions = {}
): ToolInvoker => {
  return async (name, args): Promise<ToolResult> => {
    if (!TOOL_NAMES.includes(name)) {
      // Defence in depth: `protocol.ts` already rejects unknown tools, but
      // this module must not depend on that having happened.
      return errorResult(`Unknown tool: ${name}`);
    }

    if (name === 'scamp_get_element_by_id') {
      const id = args['id'];
      if (typeof id !== 'string' || id.length === 0) {
        return errorResult(
          'scamp_get_element_by_id requires a non-empty string "id" argument.'
        );
      }
    }

    if (name === 'scamp_get_view_props' || name === 'scamp_check_view') {
      const viewName = args['name'];
      if (typeof viewName !== 'string' || viewName.length === 0) {
        return errorResult(
          `${name} requires a non-empty string "name" argument — a view or component name such as "Lobby".`
        );
      }
    }

    // Answered here, not by the renderer: the scaffold is a pure
    // function of the name and needs no canvas state.
    if (name === 'scamp_get_component_scaffold') {
      return componentScaffoldResult(args['name']);
    }
    // Imported originals live in a temp directory, not on the canvas.
    if (name === 'scamp_list_import_sources') {
      if (options.listImportSources === undefined) return textResult('[]');
      try {
        return textResult(JSON.stringify(await options.listImportSources(), null, 2));
      } catch (err) {
        return errorResult(
          `scamp_list_import_sources failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    if (name === 'scamp_get_import_source') {
      const view = args['name'];
      if (typeof view !== 'string' || view.length === 0) {
        return errorResult(
          'scamp_get_import_source requires a non-empty string "name" argument — a view name from scamp_list_import_sources.'
        );
      }
      const rawPart = args['part'] ?? 'css';
      if (rawPart !== 'css' && rawPart !== 'html') {
        return errorResult('scamp_get_import_source "part" must be "css" or "html".');
      }
      if (options.readImportSource === undefined) {
        return errorResult('No imported page is being kept for this project.');
      }
      try {
        const found = await options.readImportSource(view, rawPart);
        if (found === null) {
          return errorResult(
            `No imported original is kept for "${view}". scamp_list_import_sources says what there is.`
          );
        }
        const header = [
          `/* ${rawPart} of ${found.url}, as imported into ${view} */`,
          `/* on disk: ${found.path} */`,
          found.truncated
            ? `/* TRUNCATED at ${IMPORT_SOURCE_REPLY_LIMIT} characters — read the file for the rest */`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n');
        return textResult(`${header}\n${found.text}`);
      } catch (err) {
        return errorResult(
          `scamp_get_import_source failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    if (name === 'scamp_get_react_source') {
      const target = args['target'];
      if (typeof target !== 'string' || target.length === 0) {
        return errorResult('scamp_get_react_source requires a non-empty string "target" — a view or component name.');
      }
      if (options.reactSource === undefined) return errorResult('This project has no React import to read.');
      try {
        const answer = await options.reactSource(target, typeof args['element'] === 'string' ? args['element'] : undefined);
        return answer.ok ? textResult(answer.text) : errorResult(answer.error);
      } catch (err) {
        return errorResult(`scamp_get_react_source failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (name === 'scamp_find_overflow') {
      if (options.findOverflow === undefined) return errorResult('Scamp can’t lay views out here.');
      try {
        const answer = await options.findOverflow(args);
        return answer.ok ? textResult(answer.text) : errorResult(answer.text);
      } catch (err) {
        return errorResult(`scamp_find_overflow failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if ((name === 'scamp_check_view' || name === 'scamp_check_project') && options.checks !== undefined) {
      try {
        const answer = await options.checks(name, args);
        return answer.ok ? textResult(answer.text) : errorResult(answer.text);
      } catch (err) {
        return errorResult(`${name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Routes live on disk, not on the canvas.
    if (name === 'scamp_list_routes') {
      if (options.listRoutes === undefined) return textResult('[]');
      try {
        return textResult(JSON.stringify(await options.listRoutes(), null, 2));
      } catch (err) {
        return errorResult(`scamp_list_routes failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      return format(name, await runQuery(name, args), args);
    } catch (err) {
      // Timeouts and renderer failures land here. An isError result keeps
      // the agent's turn alive and tells it what to do next.
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`${name} failed: ${message}`);
    }
  };
};
