import { describe, expect, it } from "vitest"

import { defaultComparator } from "./rowNumbering"

describe("defaultComparator (AG Grid 36.2 semantics)", () => {
  it("puts null/undefined first", () => {
    expect(defaultComparator(null, 1)).toBe(-1)
    expect(defaultComparator(1, undefined)).toBe(1)
    expect(defaultComparator(null, undefined)).toBe(0)
  })
  it("compares with < / > (not locale) by default", () => {
    expect(defaultComparator("B", "a")).toBe(-1) // uppercase sorts before lowercase
    expect(defaultComparator("", "a")).toBe(-1)
    expect(defaultComparator(2, 10)).toBe(-1)
    expect(defaultComparator(false, true)).toBe(-1)
    expect(defaultComparator("2025-01-02", "2025-01-10")).toBe(-1)
  })
  it("uses localeCompare for strings with accentedSort", () => {
    expect(defaultComparator("é", "f", true)).toBe(-1)
  })
})
