# Tables

A table in Scamp uses real table tags—`<table>`, `<thead>`, `<tbody>`,
`<tr>`, `<th>`, and `<td>`—so screen readers and search engines read it as
a table. Scamp lays it out as a CSS grid, with the column widths set once
on the table. Every row follows the same columns, so the header and the
body always line up, and changing a column changes it in every row.

## Make a table

1. Draw a rectangle where the table goes.
2. In the **Element** section, in **Tag**, select `table`.
3. Draw inside the table to add its parts. Scamp picks the right tag for
   each one:

   | Draw inside | You get |
   |---|---|
   | The table | A `tbody`, which holds rows |
   | A `thead`, `tbody`, or `tfoot` | A `tr` row |
   | A `tr` row | A `td` cell |

   Text drawn inside a row becomes a `td` cell. Text drawn directly inside
   the table becomes its `caption`.

To make a header row, select the section that holds it and change its tag
to `thead`. To make header cells, change a cell's tag from `td` to `th`.
For a footer, use `tfoot`.

A cell can hold text or other elements. A cell that holds only words is a
text element; one that holds elements is a container, like any other.

## Set the columns

A table's column widths live on the table, not on its cells.

1. Select the table.
2. In the **Layout** section, under **Columns**, click
   **Define N columns**. Scamp counts the cells in your first row to
   suggest how many.
3. Set each column's width. A column can be a fixed size, such as
   `120px`, or a share of the remaining space, such as `1fr`.

When you select a cell, its **W** field reads **Column** and can't be
changed. That's on purpose: a cell takes its width from its column, so
the header and the body move together. To change a cell's width, change
its column on the table.

### Make a cell span columns or rows

1. Select a `th` or `td` cell.
2. In the **Element** section, set **Col span** or **Row span**.

## Style rows and cells

Select the table, and use the **Rows and cells** section. Each setting
applies to the whole table, so you set it once rather than on every row.

| Control | What it does |
|---|---|
| **Dividers** | A line under every row. Choose a style and width, then a color. |
| **Stripes** | A background color on every second row in the body. |
| **Sticky header** | Keeps the `thead` in view while the page scrolls. |
| **Cell padding** | Padding on every cell. |
| **Cell align** | Text alignment in every cell. **Auto** leaves cells to follow the table. |

A cell's own padding or alignment still wins over the table's, so you can
set one cell differently.

To style the header row, select the `thead` and give it a background like
any other element.

## Tables from an imported page

When you [import a page from the web](website-import.md), a table on the
page arrives as a Scamp table: same tags, columns measured from where the
page drew them, and set on the table. The import report lists each one as
**approximated**, because the original page laid it out with the
browser's table layout and Scamp uses a grid.

## How a table is written

Scamp writes the columns once, on the table's class:

```css
.orders_a1b2 {
  display: grid;
  grid-template-columns: 2fr 120px 100px;
}
```

Rows and sections pick those columns up through a rule Scamp writes after
the table, using `subgrid`, so no row repeats them. The **Rows and cells**
settings are written the same way, as one rule each. Scamp reads these
rules back into the panel when you reopen the project. If you or an agent
edit one by hand so it no longer matches what the panel would write,
Scamp keeps your rule as it is.

## Related pages

- [Grid layout](grid-layout.md)
- [Elements](elements.md)
- [Import a page from the web](website-import.md)
