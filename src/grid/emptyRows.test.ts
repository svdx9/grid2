import type { IRowNode } from "ag-grid-community"
import { describe, expect, it } from "vitest"

import {
  EMPTY_ROWS_BATCH,
  EMPTY_ROWS_MAX,
  emptyRowsToAdd,
  isBlankOrder,
  makeEmptyRows,
  moveEmptyRowsLast,
} from "./emptyRows"

const node = (id: string) => ({ id }) as IRowNode

describe("makeEmptyRows / isBlankOrder", () => {
  it("creates blank rows with unique ids", () => {
    const rows = makeEmptyRows(3)
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
    expect(rows.every(isBlankOrder)).toBe(true)
  })
  it("any real value makes a row non-blank; an unticked box doesn't", () => {
    const [r] = makeEmptyRows(1)
    expect(isBlankOrder({ ...r, shipped: false })).toBe(true)
    expect(isBlankOrder({ ...r, shipped: true })).toBe(false)
    expect(isBlankOrder({ ...r, quantity: 0 })).toBe(false)
    expect(isBlankOrder({ ...r, customer: "Acme" })).toBe(false)
  })
})

describe("moveEmptyRowsLast", () => {
  it("keeps data order and puts empty rows last in creation order", () => {
    const nodes = [node("empty-3"), node("b"), node("empty-1"), node("a"), node("empty-2")]
    moveEmptyRowsLast(nodes, (n) => n.id!.startsWith("empty-"))
    expect(nodes.map((n) => n.id)).toEqual(["b", "a", "empty-1", "empty-2", "empty-3"])
  })
  it("leaves the array alone without empty rows", () => {
    const nodes = [node("b"), node("a")]
    moveEmptyRowsLast(nodes, () => false)
    expect(nodes.map((n) => n.id)).toEqual(["b", "a"])
  })
})

describe("emptyRowsToAdd", () => {
  const base = { contentBottom: 3000, rowHeight: 30, current: 100 }
  it("adds nothing while far from the end", () => {
    expect(emptyRowsToAdd({ ...base, viewportBottom: 1000 })).toBe(0)
  })
  it("adds a batch near the end", () => {
    expect(emptyRowsToAdd({ ...base, viewportBottom: 2500 })).toBe(EMPTY_ROWS_BATCH)
  })
  it("respects the cap", () => {
    expect(emptyRowsToAdd({ ...base, viewportBottom: 3000, current: EMPTY_ROWS_MAX - 30 })).toBe(30)
    expect(emptyRowsToAdd({ ...base, viewportBottom: 3000, current: EMPTY_ROWS_MAX })).toBe(0)
  })
})
