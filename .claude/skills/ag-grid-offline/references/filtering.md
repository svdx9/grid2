# Filtering, and adding rows while filtered

Verified against AG Grid 36.2.0. Working code: `examples/DataGrid.tsx`.

## Column and quick filters

- Filters are chosen by name: `agTextColumnFilter`, `agNumberColumnFilter`,
  `agDateColumnFilter`, Enterprise `agSetColumnFilter`, `agMultiColumnFilter`.
  With Enterprise, `filter: true` means the Set Filter
  (`suppressSetFilterByDefault` to change that).
- `floatingFilter: true` adds the filter row under the headers.
- The quick filter (`quickFilterText`, `QuickFilterModule`) matches **raw**
  values. Users type what they see (`$1,499.99`, `Sep 2025`), so add
  `getQuickFilterText` returning raw *and* formatted text for formatted columns.
- `api.isAnyFilterPresent()` includes the quick filter; `getFilterModel()`
  covers column filters only.

## The "rows vanish while filtered" problem

- Any transaction (`applyTransaction`, also the one adding a row) re-runs
  the filter over **all** rows. Cell edits don't.
- So with a filter active: a newly added (blank) row is hidden immediately,
  and a row edited so it no longer matches disappears the next time anything
  is added or removed. Users experience lost data.

Fix — bind the filter to the rows it was applied to, with the built-in
`alwaysPassFilter` (client-side row model; discoverable offline with
`ag-lookup.mjs search "always be displayed"`):

1. Keep a `Set` of row ids in a ref. `alwaysPassFilter = node => set.has(node.id)`.
   Give the grid a **stable** function — a new reference re-runs filtering.
2. While `isAnyFilterPresent()`:
   - add the new row's id **before** `applyTransaction` (the transaction's own
     filter pass must already see it);
   - add ids in `onCellValueChanged` (covers typing, paste, fill, undo).
3. In `onFilterChanged`, compare a signature of
   `JSON.stringify(getFilterModel()) + quickFilterText` with the previous one.
   If it changed, the user asked a new question: clear the set and call
   `api.onFilterChanged()` to re-run without the kept rows. (The event fires
   after the grid has filtered, so the extra call is required.)
4. Offer "Re-apply filter" (clear + `onFilterChanged()`) and show a count.
5. Row styling: don't rely on `rowClassRules` (`RowStyleModule`) being
   re-evaluated when your set changes — call `api.redrawRows({ rowNodes })`
   (`RowApiModule`) after adding ids (not during an active edit of that row). A row-level `box-shadow` is painted over by cells; tint
   the row background and put a stripe on the first cell instead.
6. Remove ids of deleted rows from the set.

Tests to keep (see `examples/filtering.spec.ts`): add row under a filter stays
visible; row edited out of the filter survives a later transaction; pasted
overflow rows stay visible; changing the filter / re-apply hides them; works
with the quick filter; feature off → default behaviour.
