# Spreadsheet-like behaviour (Google Sheets / Excel feel)

Verified against AG Grid 36.2.0.

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

### Keeping row numbers when filtering (Sheets behaviour)

Built-in row numbers are display positions, so filtering renumbers
(1, 2, 3…). For Sheets behaviour (a filtered view reads 3, 7, 12…) pass
`rowNumbers.valueGetter` returning a per-row number computed on every
`modelUpdated`: the row's position in the current sort order over **all**
rows, ignoring filters. AG Grid's unfiltered sorted order isn't public, so
reproduce its sort (36.2 `RowNodeSorter.compareRowNodes`): raw values via
`api.getCellValue` (`CellApiModule`), `colDef.comparator` if set, otherwise
`_defaultComparator` (not exported: nulls first, then plain `<`/`>`, or
`localeCompare` with `accentedSort`); stable `Array.sort`, ties in data order
(`forEachNode` order). Test parity with the grid's own order for every column
in both directions.

```ts
// AG Grid 36.2 _defaultComparator (not exported)
function defaultComparator(a: any, b: any, accented = false) {
  if (a == null) return b == null ? 0 : -1
  if (b == null) return 1
  if (!accented || typeof a !== "string") return a > b ? 1 : a < b ? -1 : 0
  return a.localeCompare(b)
}

/** row id → number, filters ignored; call on every modelUpdated */
function computeRowNumbers(api: GridApi, isEmpty: (id?: string) => boolean) {
  const keys = api.getColumnState().filter((s) => s.sort)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((s) => ({ col: api.getColumn(s.colId)!, desc: s.sort === "desc" }))
  const accented = !!api.getGridOption("accentedSort")
  const data: IRowNode[] = [], empty: IRowNode[] = []
  api.forEachNode((n) => (isEmpty(n.id) ? empty : data).push(n)) // data order
  data.sort((a, b) => {                                            // stable
    for (const { col, desc } of keys) {
      const va = api.getCellValue({ rowNode: a, colKey: col })
      const vb = api.getCellValue({ rowNode: b, colKey: col })
      const cmp = col.getColDef().comparator
      const r = typeof cmp === "function" ? cmp(va, vb, a, b, desc) : defaultComparator(va, vb, accented)
      if (r) return desc ? -r : r
    }
    return 0
  })
  const numbers = new Map<string, number>()
  ;[...data, ...empty].forEach((n, i) => n.id && numbers.set(n.id, i + 1))
  return numbers
}
// rowNumbers: { valueGetter: (p) => numbers.get(p.node?.id) }
```

## Empty rows below the data, growing as you scroll

There's no built-in option for the client-side row model; build it from
placeholder rows:

- **Identify them** by id (e.g. `empty-<n>`) in a `Set` held in a ref, and
  expose `isEmptyRow(id)` through the grid `context` so export callbacks and
  tests can use it.
- **Always last:** `postSortRows` with a stable partition (data rows keep their
  order, empty rows follow in creation order). `postSortRows` runs on every
  sort-stage refresh, *including when no column is sorted*:

  ```ts
  postSortRows: ({ nodes }) => {
    const data = nodes.filter((n) => !isEmptyRow(n.id))
    const empty = nodes.filter((n) => isEmptyRow(n.id)).sort((a, b) => seq(a.id) - seq(b.id))
    nodes.length = 0
    nodes.push(...data, ...empty) // must mutate in place
  }
  ```
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
