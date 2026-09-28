# AG Grid × shadcn/ui (Mira) demo

A small, fully-tested React app showing AG Grid **36.2** (Enterprise, trial mode)
styled with the shadcn/ui **Mira** style (Radix base, neutral theme, Inter,
Hugeicons).

## Features

In the order they were added:

1. **Cell editing.** Text, number, date, searchable region select, checkbox
   and multi-line notes. Enter moves down like Excel, undo/redo (Ctrl+Z / Ctrl+Y),
   and invalid input keeps the old value with a notice instead of writing
   blank/NaN. — `src/grid/columns.ts`
2. **Copy / cut / paste of cell ranges.** Drag or Shift+arrows to select;
   a single copied value fills the whole selection; fill handle and Ctrl+D;
   Delete clears a range; a paste is one undo step. — `src/grid/DataGrid.tsx`
3. **Copy/paste round trip with Excel.** Canonical values on the clipboard
   plus a typed HTML table for Excel (leading zeros, dates, currency and
   multi-line cells survive); Excel's own formats are parsed on paste
   (`$1,234.50`, `(12)`, `26/09/2026`, `Sep 26, 2026`, `TRUE`…). —
   `src/grid/clipboard.ts`, `src/grid/io.ts`, `src/grid/locale.ts`
4. **Export to CSV and .xlsx**, for the visible (filtered) rows or all rows.
   CSV is UTF-8 with BOM and formula-injection protection; xlsx keeps real
   types and freezes the header and pinned column. — `src/grid/io.ts`
5. **Column filters** on every column. — `src/grid/columns.ts`
6. **Global filter**: one search box across all columns, including formatted
   values. — `src/App.tsx`
7. **Filters bound to the existing rows.** Rows added or edited while a
   filter is active stay visible (amber stripe) instead of vanishing; changing
   the filter or *Re-apply filter* evaluates it afresh; a switch restores AG
   Grid's default behaviour. — `src/grid/DataGrid.tsx`
8. **Row numbers** (Google Sheets style) in a leftmost column: click a number
   to select the whole row, drag down the numbers to select several rows. —
   `src/grid/DataGrid.tsx`
9. **Empty rows below the data**, like a spreadsheet: they fill the space under
   the data (filtered or not) and more appear as you scroll, up to 1,000. Typing
   or pasting into one makes it a real row; they're left out of counts, deletes
   and exports. — `src/grid/emptyRows.ts`
10. **Row numbers fit and are centred** — room for five digits, since the
    empty rows take the count past 999.
11. **Row numbers stay with their rows when filtering** (a filtered view reads
    3, 7, 12…, not 1, 2, 3); sorting renumbers top to bottom. —
    `src/grid/rowNumbering.ts`
12. **Excel (Mac) mode filters.** Every column has a searchable value list that
    filters as you type, with a Reset button and blanks listed last; text,
    number and date columns also have Excel's "Text/Number/Date Filter"
    conditions in a submenu; dates are a year › month › day tree; values show
    as formatted in the cells. — `src/grid/columns.ts`
13. **Filter button in the header cell**: each header reads title · filter ·
    menu, with no separate filter row; an active filter is marked on its
    button.
14. **Pinning fixed in code**: SKU is pinned left by the column definitions;
    users can't pin or unpin (no "Pin Column" in the menu).
15. **Visible columns fixed in code**: no "Choose Columns" in the menu, and
    dragging a header off the grid doesn't hide it.
16. **Column order fixed in code**: headers can't be dragged to reorder.

Plus light/dark theme from the shadcn tokens, and a build that runs inside an
embedding viewer (sizes to its frame, follows the host's `data-theme`).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (parsers, clipboard encoding)
npm run test:e2e     # 64 Playwright tests driving the real grid in Chromium
```

The xlsx e2e test reads the exported workbook with Python's `openpyxl`
(`pip install openpyxl`). To use a pre-installed Chromium, set
`PW_CHROMIUM_PATH=/path/to/chrome`.

Set `VITE_AG_GRID_LICENSE_KEY` in `.env.local` to remove the trial watermark.

## Defects this demo works around

Each of these was reproduced against AG Grid 36.2 and is covered by a test.

**Clipboard / Excel**

- *Excel's trailing line break.* Excel ends every copied range with `\r\n`.
  AG Grid turns that into an extra empty row, so a single copied cell no longer
  fills a selected range, and pasting a block writes a blank into the row
  below. → trailing empty rows are stripped in `processDataFromClipboard`.
- *Quoted cells from Excel keep their quotes.* A multi-line cell comes from
  Excel as `"Line A⏎Line ""B"""`. AG Grid splits rows correctly but leaves the
  quotes in the value. → fields are unquoted (`unquoteTsvField`). This depends
  on 36.2's tokenizer, which is why AG Grid is pinned to an exact version; a
  unit test runs a verbatim copy of that tokenizer to catch changes.
- *Multi-line cells are copied unquoted.* Range copies go out with
  `suppressQuotes`, so a cell containing a newline or tab splits into several
  cells in Excel. → `processCellForClipboard` applies Excel's quoting. (Range
  copies call it with type `'csv'`, not `'clipboard'`.)
- *Formatted values don't survive the round trip.* By default the clipboard
  gets display strings (`$1,234.50`, `Sep 26, 2025`) that depend on locale.
  → the clipboard gets canonical values (raw numbers, ISO dates, `TRUE`/`FALSE`),
  and a `text/html` version with `mso-number-format`/`x:num` so Excel types
  every cell correctly, keeps SKU leading zeros (`00123`) and keeps multi-line
  notes in one cell.
- *Pasting Excel's display formats.* One parser per column handles typing,
  paste, fill and Ctrl+D. It accepts `1,234.50`, `$1,234.50`, `(12)`, `12%`,
  `1.2E+05`, `1.234,50` in comma-decimal locales, `26/09/2026` / `9/26/2026`
  (ambiguous dates are resolved with the browser locale), `Sep 26, 2026`,
  Excel serials, and `TRUE/FALSE/yes/no`. Invalid input keeps the old value and
  shows a notice, where AG Grid's default parser would write `null`/`NaN`.
- *Pasting past the last row drops data.* → the extra rows are appended.
- *Invalid `navigator.language`.* Some environments report tags like
  `en-US@posix`, which make `Intl` throw at startup. → validated in `resolveLocale`.

**Export**

- CSV: UTF-8 BOM (AG Grid adds it), raw numbers, ISO dates, and text starting
  with `= + - @` gets a `'` prefix to block formula injection.
- xlsx: typed cells through `excelStyles` (String for SKUs so leading zeros stay,
  DateTime, Number with formats, Boolean), frozen header, pinned column frozen.
  The currency format is written as `$#,##0.00`; AG Grid double-escapes the
  quoted form `"$"#,##0.00`.

**Filtering while adding rows**

By default any transaction re-runs the filter over every row. A row you just
added (blank, so it matches nothing) or a row you edited so it no longer
matches disappears as soon as anything else changes. Here the filter is
"bound" to the rows it was applied to:

- rows added (toolbar, context menu, paste overflow) or edited while a column
  or global filter is active are recorded and let through with the grid's
  `alwaysPassFilter` callback, marked with an amber stripe;
- changing the filter criteria, or clicking **Re-apply filter**, starts a
  fresh query over all rows;
- the toolbar switch turns this off to show AG Grid's default behaviour.

**Other details**

- Opening an editor from a toolbar button leaves browser focus on the button,
  so typing goes nowhere. → the editor input gets focus explicitly.
- `getAllDisplayedColumns` and friends need `ColumnApiModule`. Without it they
  fail silently in production. The e2e suite fails on any AG Grid console
  error or warning, so missing modules show up in tests.
- `stopEditingWhenCellsLoseFocus` means clicking Export or Add row mid-edit
  commits the edit first instead of losing it.

## shadcn setup note

The Mira components in `src/components/ui` are the stock shadcn Radix
components compiled with the Mira style map. They were generated with the
shadcn CLI's own `transformStyle` from the `shadcn-ui/ui` registry source
because `ui.shadcn.com` wasn't reachable from the build environment.
`components.json` is set to `radix-mira` / Hugeicons, so
`npx shadcn add <component>` works as usual on a normal network.

## Offline agent skill: `ag-grid-offline`

`.claude/skills/ag-grid-offline/` is a Claude Code skill for AG Grid work in
environments where ag-grid.com is unreachable. The official `ag-grid/skills`
mostly route the agent to the docs website; this one carries the knowledge
and reads the rest from the installed packages:

- `scripts/ag-lookup.mjs` — offline API reference from the installed
  `.d.ts` files and source: `doc`, `module`, `search` (discover features by
  description), `source`, `modules`, and `docs` (searches a local snapshot).
- `scripts/check-modules.mjs` — static check that every option / colDef
  property / API method used has its module registered (the "silently inert
  feature" bug).
- `scripts/snapshot-docs.mjs` — snapshots the docs for the installed version
  from the AG Grid repo or an internal git mirror (the snapshot itself is
  gitignored).
- `references/*.md` — tested rules for clipboard/Excel, export, editing,
  filtering, setup and verification.
