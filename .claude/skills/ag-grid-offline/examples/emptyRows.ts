/**
 * Sheets-style empty rows below the data.
 *
 * Empty rows are placeholder rows (ids starting with `EMPTY_ROW_PREFIX`) that:
 * - always sit below the data, whatever the sort (`postSortRows`)
 * - always pass filters (`alwaysPassFilter`), so a filtered subset is still
 *   followed by empty rows
 * - are left out of row counts and exports
 * - become real rows as soon as a value is typed or pasted into them, and turn
 *   back into empty rows if all their values are cleared.
 *
 * More are added in batches as the user scrolls near the end, up to a cap.
 * Batching matters: AG Grid clears the undo history whenever rows are added.
 */
import type { IRowNode } from "ag-grid-community"

import type { Order } from "./data"

export const EMPTY_ROW_PREFIX = "empty-"
export const EMPTY_ROWS_INITIAL = 100
export const EMPTY_ROWS_BATCH = 100
export const EMPTY_ROWS_MAX = 1000
/** add a batch when the viewport bottom gets within this many rows of the end */
export const EMPTY_ROWS_THRESHOLD = 20

let seq = 0

export function makeEmptyRows(count: number): Order[] {
  return Array.from({ length: count }, () => ({
    id: `${EMPTY_ROW_PREFIX}${++seq}`,
    sku: "",
    customer: "",
    region: null,
    product: "",
    quantity: null,
    unitPrice: null,
    orderDate: null,
    shipped: null,
    notes: "",
  }))
}

/** true when a row has no user-entered values (an unticked checkbox counts as empty) */
export function isBlankOrder(o: Order): boolean {
  return (
    !o.sku &&
    !o.customer &&
    o.region == null &&
    !o.product &&
    o.quantity == null &&
    o.unitPrice == null &&
    o.orderDate == null &&
    o.shipped !== true &&
    !o.notes
  )
}

const seqOf = (id: string | undefined) => Number(id?.slice(EMPTY_ROW_PREFIX.length) ?? 0)

/**
 * Stable in-place partition for `postSortRows`: data rows keep their sorted
 * order, empty rows follow in creation order (they're all blank, so a sort
 * would otherwise scatter or float them).
 */
export function moveEmptyRowsLast<T>(nodes: IRowNode<T>[], isEmpty: (node: IRowNode<T>) => boolean) {
  const data: IRowNode<T>[] = []
  const empty: IRowNode<T>[] = []
  for (const n of nodes) (isEmpty(n) ? empty : data).push(n)
  if (!empty.length) return
  empty.sort((a, b) => seqOf(a.id) - seqOf(b.id))
  nodes.length = 0
  nodes.push(...data, ...empty)
}

/** How many empty rows to add after a scroll, given where the viewport is. */
export function emptyRowsToAdd(params: {
  viewportBottom: number
  contentBottom: number
  rowHeight: number
  current: number
}): number {
  const { viewportBottom, contentBottom, rowHeight, current } = params
  if (current >= EMPTY_ROWS_MAX) return 0
  if (viewportBottom < contentBottom - EMPTY_ROWS_THRESHOLD * rowHeight) return 0
  return Math.min(EMPTY_ROWS_BATCH, EMPTY_ROWS_MAX - current)
}
