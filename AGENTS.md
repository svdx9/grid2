# AGENTS.md — building AG Grid features in this repo

Guidance for a coding agent (Claude Code, Codex, …) adding a grid feature
like the ones in this demo. The feature list in `README.md` is the product
spec. This file tells you how to build each feature without the defects
agents usually introduce.

## 1. Use the offline skill first

AG Grid moves faster than your training data, and ag-grid.com may be
blocked. `.claude/skills/ag-grid-offline/` holds the rules and the lookup
tools. Read its `SKILL.md`, then load the topic reference for what you're
touching.

At the start of every grid task:

```bash
S=.claude/skills/ag-grid-offline/scripts
node $S/ag-lookup.mjs version                 # what you're writing against (36.2.0, pinned)
node $S/check-modules.mjs src                 # must exit 0 before and after your change
node $S/ag-lookup.mjs search "<what you want>" --in options   # is there a built-in?
node $S/ag-lookup.mjs doc <option>            # type, default, @agModule, @deprecated
node $S/ag-lookup.mjs source "<symbol>" -C 20 # what it really does
```

Lookup order:
1. this repo's code;
2. the skill references;
3. the installed package (`ag-lookup.mjs`);
4. the docs snapshot;
5. the website, if reachable.

Never guess an option name from memory. Never conclude a feature doesn't
exist until `search` has been run.

## 2. Ground rules

- **Modules.** Every option, colDef property and API method may need a
  module. An unregistered module makes the feature silently do nothing.
  Register modules in `src/grid/DataGrid.tsx` and confirm with
  `check-modules.mjs`.
- **Prefer the built-in feature.** `ag-grid-enterprise` is a dependency, so
  use the Enterprise feature rather than hand-rolling one.
- **One parse path.** All input parsing lives in `colDef.valueParser` (typing,
  paste, fill handle, Ctrl+D). For invalid input, return `params.oldValue`
  and report it through `context.onInvalidValue`.
- **Stable references.** Grid props that are functions or objects are
  module constants, or wrapped in `useMemo`/`useCallback`. A new
  `alwaysPassFilter` or `postSortRows` reference re-runs the row model.
- **StrictMode.** State initialisers run twice, so keep them pure (see the
  empty-rows id set).
- **`getRowId`** is always set. Features key on row ids (kept rows, empty
  rows, row numbers).
- **Don't hand-edit `src/components/ui`.** Those are generated shadcn (Mira)
  components.
- **AG Grid is pinned exactly** (`36.2.0`). Several fixes depend on its
  internals and have tests that detect changes. When upgrading, read the
  `upgrading-to-ag-grid-N` docs page and re-run everything.

## 3. Features, in the order they were built

Each entry gives:
- **Behaviour:** the acceptance behaviour.
- **How:** the AG Grid mechanism.
- **Read:** the skill reference to read.
- **Test:** what the test must prove.

Keep this order when building something similar: later features assume the
earlier ones exist.

### 1. Cell editing
- **Behaviour:**
  - Typed editors: text, number, date, rich select, checkbox, large text.
  - Enter moves down.
  - Undo/redo works.
  - Invalid input keeps the old value and shows a notice.
- **How:**
  - `cellDataType` plus `cellEditor` per column.
  - `enterNavigatesVerticallyAfterEdit`.
  - `undoRedoCellEditing`.
  - `stopEditingWhenCellsLoseFocus: true`.
  - Call `api.stopEditing()` before export, add or delete.
  - When a toolbar button starts an edit, focus the editor input in
    `requestAnimationFrame`.
- **Read:** `references/editing.md`.
- **Test:** `e2e/editing.spec.ts`; `valueParser` unit tests in `src/grid/locale.test.ts`.

### 2. Copy / cut / paste of cell ranges
- **Behaviour:**
  - Select ranges with drag or Shift+arrows.
  - One copied value fills the whole selection.
  - Fill handle and Ctrl+D work.
  - Delete clears a range.
  - A paste is one undo step.
  - Pasting past the last row appends rows.
- **How:**
  - `ClipboardModule` and `CellSelectionModule`.
  - `cellSelection={{ handle: { mode: "fill" } }}`.
  - Strip trailing empty rows in `processDataFromClipboard`.
  - Append overflow rows on `pasteEnd`.
- **Read:** `references/clipboard.md`, rules 1, 7 and 11.
- **Test:** `e2e/clipboard.spec.ts`:
  - single value fills a range;
  - block with trailing CRLF;
  - overflow;
  - undo.

### 3. Copy/paste round trip with Excel
- **Behaviour:**
  - Values survive grid → Excel → grid: leading zeros, dates, currency,
    multi-line cells.
  - Excel's display formats parse on paste.
- **How:**
  - `processCellForClipboard` returns canonical text (raw numbers, ISO
    dates, `TRUE`/`FALSE`) and applies Excel quoting except for `dragCopy`.
    Range copies call it with type `'csv'`.
  - Unquote fields in `processDataFromClipboard`.
  - Send a `text/html` flavour with `mso-number-format` / `x:num`.
  - Locale-aware parsers, validated through `resolveLocale`.
- **Read:** `references/clipboard.md`, rules 2–6 and 9.
- **Test:**
  - Unit tests for the parsers in a dot-decimal and a comma-decimal locale
    (`locale.test.ts`), plus the tokenizer copy (`clipboard.test.ts`).
  - An e2e grid→grid equality check.
  - An e2e paste of a quoted multi-line cell.

### 4. Export to CSV and .xlsx
- **Behaviour:**
  - Export the visible (filtered) rows or all rows.
  - CSV: UTF-8 with BOM, raw values, formula-injection guard.
  - xlsx: typed cells, frozen header and pinned column.
- **How:**
  - `exportDataAsCsv` / `exportDataAsExcel` with `exportedRows`.
  - `processCellCallback`.
  - `excelStyles`.
  - `shouldRowBeSkipped` for empty rows (feature 9).
- **Read:** `references/export.md`.
- **Test:** `e2e/export.spec.ts`. Capture the download and parse it: CSV
  text; xlsx via `openpyxl`.

### 5. Column filters
- **Behaviour:** every column is filterable with a filter that fits its type.
- **How:**
  - `filter` per column.
  - Type-aware `filterParams`.
- **Read:** `references/filtering.md`, "Column and quick filters".
- **Test:** `e2e/filtering.spec.ts`. Set a filter through the UI and through
  `setFilterModel`, then assert on the ids of the displayed rows.

### 6. Global filter
- **Behaviour:** one search box across all columns, matching formatted
  values too.
- **How:** `quickFilterText`, with `getQuickFilterText` wherever the
  formatted value differs from the raw one.
- **Read:** `references/filtering.md`.
- **Test:** `e2e/filtering.spec.ts`. Search for a formatted value such as
  `$1,234`.

### 7. Filters bound to the existing rows
- **Behaviour:**
  - Rows added or edited while a filter is active stay visible, with an
    amber stripe.
  - Changing the filter, or *Re-apply filter*, evaluates it afresh.
  - A switch restores AG Grid's default.
- **How:**
  - Keep a `keptIds` set that `alwaysPassFilter` checks.
  - Record ids on add, paste overflow and edit.
  - Clear the set when the filter signature changes (column model plus
    quick filter).
- **Read:** `references/filtering.md`, "The rows vanish while filtered
  problem".
- **Test:**
  - Add a row under a filter, then trigger another transaction: the row is
    still displayed.
  - Change the filter: the row is gone.

### 8. Row numbers (Google Sheets style)
- **Behaviour:**
  - A leftmost number column.
  - Click a number to select the row; drag down the numbers to select several.
- **How:** the `rowNumbers` grid option (`RowNumbersModule`), which gives
  row selection through cell selection.
- **Read:** `references/sheet-like.md`, "Row numbers with row selection".
- **Test:** `e2e/row-numbers.spec.ts`. Click, and drag across numbers, then
  assert the selected range.

### 9. Empty rows below the data
- **Behaviour:**
  - Blank rows fill the space under the data, filtered or not.
  - More appear on scroll, up to 1,000.
  - Editing or pasting into one makes it a real row.
  - Empty rows are excluded from counts, deletes and exports.
- **How:**
  - Track an `emptyIds` set.
  - `alwaysPassFilter` lets empty rows through.
  - `postSortRows` keeps them last; it runs even with no sort.
  - Grow in `onBodyScroll`.
  - Promote or demote rows in `onCellValueChanged`.
  - Use `isEmptyRow` in `context` for every consumer.
- **Read:** `references/sheet-like.md`, "Empty rows below the data".
- **Test:** `e2e/empty-rows.spec.ts`:
  - rows fill under a filter;
  - scroll grows the rows and stops at the cap;
  - typing promotes a row;
  - export skips empty rows.

### 10. Row numbers fit and are centred
- **Behaviour:** five digits fit without truncation, and the text is centred.
- **How:**
  - `rowNumbers={{ width: 64, minWidth: 64 }}`. The column auto-sizes only
    on full refreshes, not after transactions.
  - Centre with CSS and `tabular-nums` in `src/index.css`.
- **Read:** `references/sheet-like.md`.
- **Test:** `e2e/row-numbers.spec.ts`. Four-digit numbers are not truncated
  after rows are added, and the text is centred.

### 11. Row numbers stay with their rows when filtering
- **Behaviour:**
  - A filtered view reads 3, 7, 12…
  - Sorting renumbers top to bottom.
- **How:**
  - `rowNumbers.valueGetter` reads `context.rowNumberOf(id)`.
  - Compute the map in `onModelUpdated` from the unfiltered, sorted order
    (`computeRowNumbers` in `src/grid/rowNumbering.ts`).
- **Read:** `references/sheet-like.md`, "Keeping row numbers when filtering".
- **Test:**
  - Unit test for `computeRowNumbers`.
  - e2e: filter, and the numbers match the unfiltered view; sort, and the
    numbers read 1..n.

### 12. Excel (Mac) mode filters
- **Behaviour:**
  - A searchable value list that filters as you type.
  - A Reset button; blanks listed last.
  - Text, number and date conditions in a submenu.
  - Dates shown as a year › month › day tree.
  - Values formatted as in the cells.
- **How:**
  - `agMultiColumnFilter`: a condition filter with `display: "subMenu"`,
    then `agSetColumnFilter` with `excelMode: "mac"`.
  - Set `valueFormatter` in the set filter params (`listValues()`), so the
    list matches the cells.
  - Needs `MultiFilterModule` and `SetFilterModule`.
  - See `excelFilter()` in `src/grid/columns.ts`.
- **Read:** `references/filtering.md`, "Excel-style filters".
- **Test:** `e2e/excel-filter.spec.ts`. Match set-filter entries by exact
  text, not a substring.

### 13. Filter button in the header cell
- **Behaviour:**
  - Each header reads title · filter · menu.
  - There is no separate floating-filter row.
  - An active filter is marked on its button.
- **How:** `floatingFilter: false` in `defaultColDef`. The header then
  renders the filter button itself; no custom header component is needed.
- **Read:** `references/filtering.md`.
- **Test:** `e2e/filtering.spec.ts`:
  - one header row;
  - the order of the header controls;
  - the button opens the filter.

### 14. Pinning fixed in code
- **Behaviour:** SKU is pinned left by the column definitions, and users
  can't pin or unpin.
- **How:** `pinned: "left"` on the colDef, plus `lockPinned: true` in
  `defaultColDef`. That removes "Pin Column" from the menu and blocks
  drag-to-pin.
- **Read:** `references/setup.md`, "Fixed column layout".
- **Test:** `e2e/filtering.spec.ts`. The column menu has no "Pin Column".

### 15. Visible columns fixed in code
- **Behaviour:**
  - There is no "Choose Columns" in the menu.
  - Dragging a header off the grid doesn't hide it.
- **How:**
  - A `mainMenuItems` callback drops `columnChooser` and tidies the
    separators.
  - `suppressDragLeaveHidesColumns`.
- **Read:** `references/setup.md`, "Fixed column layout".
- **Test:** `e2e/filtering.spec.ts`. No "Choose Columns" in the menu.

### 16. Column order fixed in code
- **Behaviour:** headers can't be dragged to reorder.
- **How:** `suppressMovableColumns`.
- **Read:** `references/setup.md`, "Fixed column layout".
- **Test:** `e2e/filtering.spec.ts`. Drag a header across another; the
  column order is unchanged.

## 4. Where things live

| Path | What |
| --- | --- |
| `src/grid/DataGrid.tsx` | grid props, module registration, kept/empty rows, paste overflow, export |
| `src/grid/columns.ts` | column defs, parsers, `excelFilter()`, `mainMenuItems`, `GridContext` |
| `src/grid/{clipboard,io,locale,emptyRows,rowNumbering}.ts` | pure logic, each with a `*.test.ts` beside it |
| `src/grid/theme.ts` | `themeQuartz.withParams` mapped to shadcn CSS variables |
| `e2e/` | Playwright specs; `helpers.ts` has the console fixture and grid helpers |
| `.claude/skills/ag-grid-offline/` | the skill: rules, lookup and module-check scripts |

Put pure logic in a `src/grid/*.ts` module with unit tests, and keep
`DataGrid.tsx` as the wiring. In e2e tests, import `test` from
`e2e/helpers.ts` (never directly from `@playwright/test`). Assert on
`window.__gridApi` data rather than rendered text.

## 5. Definition of done

```bash
node .claude/skills/ag-grid-offline/scripts/check-modules.mjs src   # exit 0
npm run typecheck
npm run lint
npm test                 # unit
npm run test:e2e         # Playwright; set PW_CHROMIUM_PATH to use a system Chromium
```

- Zero AG Grid console errors or warnings. The fixture fails the test
  otherwise.
- The new behaviour has an e2e test. Pure logic also has a unit test.
- README's feature list gains the new item, and the skill reference gains
  any rule you had to discover from `source`. Keep those to short snippets,
  not copies of app code.
