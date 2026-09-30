# Helping an agent bulk-import a React repo

A plan for `agent.md` and the MCP, from the review in
[`../notes/agent-authored-views-review.md`](../notes/agent-authored-views-review.md).

---

## The evidence, which says something different from "the agent ignored the rule"

`agent.md` says, in one sentence with two clauses:

> Before referencing a token, check it exists in `theme.css`. **Add
> missing tokens to `theme.css` first; never inline raw hex / rgba**

Across 60 screens the agent wrote **zero** raw hex or rgba literals. Our
own importer, on two views of the same project, wrote **540**.

So the agent did not ignore the rule. It obeyed the second clause with
perfect fidelity and skipped the first entirely — and then referenced 237
tokens that do not exist.

The two clauses cost wildly different amounts:

| clause | where the work happens | cost |
|---|---|---|
| never inline raw hex | the file already open | free |
| add missing tokens first | a **different** file, before this one | a detour, every time |

Nothing couples them. An agent writing its fortieth screen at speed takes
the free half. **The rule as written is a trap**: it forbids the thing
that would have worked and requires a detour to reach the thing that
would have worked better.

**And for an import the rule is simply wrong.** Scamp's own importer
stopped inventing tokens in 0.8.7, for the reason in that release note: a
design system is a set of decisions about what *should* be shared, and
counting how often a colour appears cannot make those. An agent
transcribing someone else's React repo is in exactly that position, and
`agent.md` currently tells it the opposite.

---

## The core change

**The token rule is conditional on what the agent is doing, and
`agent.md` states it unconditionally.**

| | authoring in Scamp | transcribing an existing design |
|---|---|---|
| where the design lives | the project's theme | the source repo |
| the right value | a token | **the literal the source has** |
| inventing a token is | the point | a guess nobody asked for |

"Transcribing" covers a React repo, a page through the importer, a Figma
paste — anything where the design already exists somewhere else and the
job is to carry it across faithfully.

---

## Phase 1 — say the rule has a mode

`agent.md` is **1,427 lines** in a real project (2,788 in the template
source). Adding prose to it is not free, so this phase moves as much as
it adds.

Add one short section, high, right after **Critical rules**:

> ### Are you authoring, or transcribing?
>
> **Transcribing** — porting a React repo, importing a page, converting
> a Figma file. Write the **literal values the source has**. Do not
> invent tokens, do not map colours onto the project's palette, do not
> tidy. A faithful copy is the deliverable; turning values into tokens
> is a design decision the user makes afterwards, against something they
> can see.
>
> **Authoring** — designing in Scamp. Use tokens, and
> `scamp_get_theme_tokens` first. If the value you want has no token,
> **declare it in `theme.css` before you reference it** — a
> `var(--name)` nothing declares renders as nothing, and the screen
> comes out monochrome with no error anywhere.

Then change the existing rule from an absolute to a conditional, so the
two halves cannot come apart:

> - When authoring, reference a token only if `theme.css` declares it;
>   declare it there first if not. **When transcribing, write the
>   literal.** What you must never do is reference a token that does not
>   exist.

The last sentence is the invariant. It is true in both modes, and it is
the one the 60 screens broke.

---

## Phase 2 — make the expensive half cheap

The detour is the cause. Shorten it.

**2a. `scamp_get_conventions` returns the declared token names inline.**
An agent that reads conventions at all — which is what we tell it to do
first — then has the token list in hand without a second call, and the
"check it exists" step costs nothing. Small change, no new tool.

**2b. A bulk check: `scamp_check_project`.** `scamp_check_view` is
per-view. A 60-screen import means 60 calls, which is why zero happened.
One call that lints every view and returns counts by kind, worst first,
with the top offenders named, is the tool an agent finishes a bulk import
with — and the one that would have printed `undeclared-token: 6339`
before the user ever opened the app.

**2c. An open question I am not deciding alone.** The write path is the
real gap and it has a real trade-off:

- Scamp's MCP is **read-only by design**. The agent writes with its own
  file tools, so we are never in the write path.
- The one file where that costs us is `theme.css`, because declaring a
  token is the step that keeps getting skipped.
- A narrow `scamp_declare_tokens` — theme.css only, additive only, never
  overwriting an existing name — would make the expensive half a single
  call instead of a detour.

That breaks the read-only property for one file. Worth it or not is your
call; everything else in this plan works either way.

---

## Phase 3 — tools and direction for a clean React import

What an agent porting a React repo actually needs, in the order it needs
it:

**Before writing anything — what Scamp cannot express.** Tables,
`display: contents`, and "hidden below this width" have no equivalent.
An agent that learns this on screen 40 has 39 to revisit. The importer
already knows the list — it is the `lost` half of `importReport.ts` — and
it should be a conventions section, `Transcribing an existing design`,
naming each limit and what to do instead.

**While writing — the mapping that keeps a view editable.** The review
found 286 `not-panel-editable` and 265 `side-not-typed` findings in the
agent's work and, honestly, proportionally *more* in our importer's. Both
come from the same gap: a value can be correct and still fall out of the
panel. `scamp_get_conventions` has a CSS-properties section; it should
say plainly which shorthand Scamp types and which longhand drops out —
`border-color` not `border-top-color`, the typed `box-shadow` form, and
so on.

**After each view — the check that already exists.** `scamp_check_view`
is right; nothing needs to change except that Phase 1's new section tells
the agent to call it per view during a bulk import rather than at the
end.

**Bindings.** 0 of 60 views used a `Show` or `Repeat`, so loading, error
and empty states all render stacked. A React source usually makes these
conditional in JSX, which means the information is right there in the
source being ported. A conventions note — *a conditional in the source
becomes `Show only when…`, a `.map()` becomes `Repeat this…`* — turns a
reading of the source into the right Scamp shape.

---

## Phase 4 — make silence stop looking like success

The Checks section shipped with the review and closes the human half: a
person opening a view now sees the count.

The agent half is cheaper than it looks. `scamp_get_active_page` and the
canvas snapshot are what an agent calls to see where it is; either can
carry a findings count. An agent that looks at the canvas *at all* would
then see `12 checks` without having chosen to ask — which, given the MCP
cannot gate the write, is the closest thing to enforcement available.

---

## How we will know it worked

The review is the baseline and it is reproducible: `parseCode` plus
`lintView` over every view in a project, which is how the 6,906 was
counted. Re-run it on the next bulk import.

| | now | target |
|---|---|---|
| undeclared tokens | 6,339 | **0** |
| views using a binding | 0 of 60 | most screens with states |
| findings per element | 1.20 | at or below the importer's 0.40 |

The first row is the one that matters. Everything else in this plan is
worth doing; only that one is why the screens were monochrome.

---

## What not to do

**Don't make literals the universal rule.** Authoring in Scamp should
still produce a design system — that is the product. Only transcription
is exempt.

**Don't try to gate the write path wholesale.** The MCP is read-only by
design and the agent uses its own file tools. Phase 2c is the one narrow
exception worth discussing, and it is one file.

**Don't add prose to `agent.md` without moving some out.** It is 1,427
lines, and the rule that failed was already in it. A rule nobody reaches
is not a rule — which is the whole finding, and would apply just as well
to anything this plan adds.
