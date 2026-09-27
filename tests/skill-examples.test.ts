import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

// The ag-grid-offline skill ships copies of the tested demo code as examples.
// Keep them identical so the skill never teaches code that isn't tested.
const root = path.resolve(import.meta.dirname, "..")
const examples = path.join(root, ".claude/skills/ag-grid-offline/examples")
const sources: Record<string, string> = {
  "clipboard.ts": "src/grid/clipboard.ts",
  "io.ts": "src/grid/io.ts",
  "locale.ts": "src/grid/locale.ts",
  "columns.ts": "src/grid/columns.ts",
  "DataGrid.tsx": "src/grid/DataGrid.tsx",
  "theme.ts": "src/grid/theme.ts",
  "data.ts": "src/grid/data.ts",
  "emptyRows.ts": "src/grid/emptyRows.ts",
  "rowNumbering.ts": "src/grid/rowNumbering.ts",
  "helpers.ts": "e2e/helpers.ts",
  "clipboard.spec.ts": "e2e/clipboard.spec.ts",
  "filtering.spec.ts": "e2e/filtering.spec.ts",
  "export.spec.ts": "e2e/export.spec.ts",
  "editing.spec.ts": "e2e/editing.spec.ts",
  "row-numbers.spec.ts": "e2e/row-numbers.spec.ts",
  "empty-rows.spec.ts": "e2e/empty-rows.spec.ts",
}

describe("skill examples match the tested app code", () => {
  it.each(Object.entries(sources))("%s", (example, source) => {
    const a = fs.readFileSync(path.join(examples, example), "utf8")
    const b = fs.readFileSync(path.join(root, source), "utf8")
    expect(a, `run: cp ${source} .claude/skills/ag-grid-offline/examples/${example}`).toBe(b)
  })
})
