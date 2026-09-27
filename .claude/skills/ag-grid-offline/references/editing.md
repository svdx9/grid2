# Editing, adding and deleting rows

Verified against AG Grid 36.2.0. Working code: `examples/columns.ts`,
`examples/DataGrid.tsx`.

## Editors and parsing

- Editor modules are separate: `TextEditorModule`, `NumberEditorModule`,
  `DateEditorModule`, `CheckboxEditorModule`, `LargeTextEditorModule`,
  `SelectEditorModule`, Enterprise `RichSelectModule`. `check-modules.mjs`
  catches a missing one.
- With `cellDataType: 'number'`/`'dateString'` the editor hands `valueParser` a
  typed value (number / `YYYY-MM-DD`), while paste hands it a string. Make
  parsers accept both.
- `cellDataType: 'dateString'` expects `YYYY-MM-DD` strings in the data;
  anything else triggers a data-type warning.
- Invalid input: return `params.oldValue` and report it (via grid `context`),
  instead of letting the default parser write `null`.
- Validate enumerations in the parser too (e.g. a region list): a paste
  bypasses the select editor's list.
- Multi-line text: `agLargeTextCellEditor` with `cellEditorPopup: true`.

## Behaviour

- `stopEditingWhenCellsLoseFocus: true` — otherwise clicking a toolbar
  button leaves the editor open and the value uncommitted.
- `enterNavigatesVertically` + `enterNavigatesVerticallyAfterEdit` for
  Excel-like Enter.
- `undoRedoCellEditing` (`UndoRedoEditModule`, `@initial`) undoes edits,
  a whole paste as one step, and Delete-clearing a range (all tested). Rows
  added/removed by your own transactions are not undone by it.
- **The undo history is cleared by every `modelUpdated` that doesn't carry
  `keepUndoRedoStack`** — which includes `applyTransaction`, sorting and
  filtering (36.2). Anything that adds rows in the background (auto-growing
  grids, polling) silently wipes undo, so batch such updates.
  Re-verify: `ag-lookup.mjs source "keepUndoRedoStack" -C 3`.
- Edits don't re-run sort or filter; the next transaction does. A row edited
  out of the active filter disappears at that point — see `filtering.md`.

## Adding rows from outside the grid (toolbar button)

`api.startEditingCell()` called from a button click opens the editor but
**leaves browser focus on the button** — typing goes nowhere. After
`setFocusedCell` + `startEditingCell`, focus the editor explicitly on the
next frame:

```ts
const result = api.applyTransaction({ add: [row], addIndex })
const node = result?.add[0]
if (node?.rowIndex != null) {
  api.ensureNodeVisible(node)
  api.setFocusedCell(node.rowIndex, "sku")
  api.startEditingCell({ rowIndex: node.rowIndex, colKey: "sku" })
  requestAnimationFrame(() => {
    const [editor] = api.getCellEditorInstances({ rowNodes: [node], columns: ["sku"] })
    const input = (editor as { getGui?: () => HTMLElement })?.getGui?.()
      ?.querySelector<HTMLElement>("input, textarea")
    if (input && document.activeElement !== input) input.focus()
  })
}
```

- Insert below the focused row with
  `addIndex = focusedNode.sourceRowIndex + 1` (position in the data, not the
  display — sorting still decides where it shows).
- Deleting "selected" rows with cell selection: collect rows covered by
  `api.getCellRanges()` (fall back to the focused cell), then
  `applyTransaction({ remove })`, then `clearCellSelection()`.
- Modules for these calls (36.2): `getCellRanges`/`clearCellSelection` →
  `CellSelectionModule`; `applyTransaction` → `ClientSideRowModelApiModule`;
  `ensureNodeVisible` → `ScrollApiModule`; `getAllDisplayedColumns` →
  `ColumnApiModule`; `startEditingCell`/`getCellEditorInstances` → any editor
  module. Confirm with `ag-lookup.mjs module <name>`.
