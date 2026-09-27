# Spreadsheet-like behaviour (Google Sheets / Excel feel)

Verified against AG Grid 36.2.0. Working code: `examples/DataGrid.tsx`,
`examples/emptyRows.ts`, tests in `examples/row-numbers.spec.ts` and
`examples/empty-rows.spec.ts`.

## Row numbers with row selection

Built in — don't hand-roll a number column. `rowNumbers: true` (or a
`RowNumbersOptions` object) + Enterprise `RowNumbersModule`. With
`cellSelection` on, clicking a number selects the whole row and dragging down
the numbers selects a block of rows (verified in a browser); copy, paste and
Delete then act on whole rows. Numbers are display positions, so they follow
sort and filter. The selected-number colour derives from `accentColor`; with a
near-black accent set `rowNumbersSelectedColor` (and
`rangeHeaderHighlightColor`) explicitly or the digits become unreadable.
Row numbers are not exported unless `exportRowNumbers: true`.
The column auto-fits its width to the row count only on full refreshes
(`modelUpdated` without `keepRenderedRows`), not after `applyTransaction` —
if rows are added by transactions, set `minWidth` wide enough for the
largest number (e.g. 64px for 5 digits at 12px) or the digits get clipped.

## Empty rows below the data, growing as you scroll

There's no built-in option for the client-side row model; build it from
placeholder rows:

- **Identify them** by id (e.g. `empty-<n>`) in a `Set` held in a ref, and
  expose `isEmptyRow(id)` through the grid `context` so export callbacks and
  tests can use it.
- **Always last:** `postSortRows` with a stable partition (data rows keep their
  order, empty rows follow in creation order). `postSortRows` runs on every
  sort-stage refresh, *including when no column is sorted*.
- **Always visible:** return `true` from `alwaysPassFilter` for them, so a
  filtered subset (column filters or quick filter) is still followed by empty
  rows. Filter changes then need no extra rows.
- **Grow on scroll:** in `onBodyScroll` (vertical), compare
  `api.getVerticalPixelRange().bottom` with the last displayed row's
  `rowTop + rowHeight`; near the end, `applyTransaction({ add })` a batch.
  Cap the total. Check once in `onFirstDataRendered` for tall screens.
  **Batch generously** — each addition clears the undo history (see
  `editing.md`).
- **Become data:** in `onCellValueChanged`, a non-blank empty row leaves the
  set; a row that started empty and is blank again (undo, Delete) rejoins it.
  Refresh row classes with `redrawRows` — after the paste (`pasteEnd`), not
  per cell. No transaction is needed, so the row doesn't jump while the user
  is typing; it settles directly under the data at the next sort/refresh.
- **Leave them out** of row counts (`getDisplayedRowCount() - emptyCount`),
  "delete rows", kept-row tracking, and exports
  (`shouldRowBeSkipped` in `defaultCsvExportParams` /
  `defaultExcelExportParams` and in explicit export calls).
- **Look empty:** blank values, `shipped: null`, and hide the checkbox via a
  `rowClassRules` class.
- Set filter lists gain a "(Blanks)" entry from the empty rows (as in Sheets).

**React StrictMode pitfall:** state initialisers run twice in development.
Create the rows *and* the id set in the same pure initialiser
(`useState(initialRows)` returning both) — filling a ref as a side effect of
the initialiser leaves the set holding the other call's ids, so nothing is
recognised as empty.
