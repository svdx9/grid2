/**
 * Sheets-style row numbers: a row keeps its number when filters hide other
 * rows (a filtered view reads 3, 7, 12… instead of 1, 2, 3).
 *
 * A row's number is its position in the *current sort order over all rows*,
 * ignoring filters. Sorting still numbers top-to-bottom (as sorting a range in
 * Sheets does), and the empty rows below the data continue after the last
 * data row.
 *
 * AG Grid's own row numbers are display positions, and its sorted-but-
 * unfiltered order isn't public, so the sort is reproduced here exactly as
 * AG Grid 36.2 does it (RowNodeSorter.compareRowNodes): raw cell values
 * (value getters applied), `colDef.comparator` when set, otherwise its
 * `_defaultComparator`; stable, ties in data order. Tests compare the result
 * with the grid's own unfiltered order for every sortable column.
 */
import type { Column, GridApi, IRowNode } from "ag-grid-community"

/** AG Grid 36.2 `_defaultComparator` (ag-stack), which isn't exported publicly */
export function defaultComparator(a: unknown, b: unknown, accented = false): number {
  const num = (v: unknown) =>
    typeof v === "object" && v !== null && typeof (v as { toNumber?: unknown }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : v
  const valueA = num(a) as never
  const valueB = num(b) as never
  if (valueA == null) return valueB == null ? 0 : -1
  if (valueB == null) return 1
  if (!accented || typeof valueA !== "string") return valueA > valueB ? 1 : valueA < valueB ? -1 : 0
  return (valueA as string).localeCompare(valueB)
}

interface SortKey {
  column: Column
  descending: boolean
  comparator?: (a: unknown, b: unknown, nodeA: IRowNode, nodeB: IRowNode, descending: boolean) => number
}

/** Row id → 1-based row number, with filters ignored. */
export function computeRowNumbers<T>(api: GridApi<T>, isEmpty: (id: string | undefined) => boolean) {
  const keys: SortKey[] = api
    .getColumnState()
    .filter((s) => s.sort)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .flatMap((s) => {
      const column = api.getColumn(s.colId)
      if (!column) return []
      const comparator = column.getColDef().comparator
      return [{ column, descending: s.sort === "desc", comparator: typeof comparator === "function" ? comparator : undefined }]
    })
  const accented = !!api.getGridOption("accentedSort")

  // all rows in data order (the order AG Grid feeds its stable sort)
  const data: IRowNode<T>[] = []
  const empty: IRowNode<T>[] = []
  api.forEachNode((node) => (isEmpty(node.id) ? empty : data).push(node))

  if (keys.length) {
    const values = new Map<IRowNode<T>, unknown[]>()
    for (const node of data) values.set(node, keys.map((k) => api.getCellValue({ rowNode: node, colKey: k.column })))
    data.sort((a, b) => {
      const va = values.get(a)!
      const vb = values.get(b)!
      for (let i = 0; i < keys.length; i++) {
        const { comparator, descending } = keys[i]
        const result = comparator
          ? comparator(va[i], vb[i], a as IRowNode, b as IRowNode, descending)
          : defaultComparator(va[i], vb[i], accented)
        if (result) return descending ? -result : result
      }
      return 0
    })
  }

  const numbers = new Map<string, number>()
  let n = 0
  for (const node of data) if (node.id) numbers.set(node.id, ++n)
  for (const node of empty) if (node.id) numbers.set(node.id, ++n) // already in creation order
  return numbers
}
