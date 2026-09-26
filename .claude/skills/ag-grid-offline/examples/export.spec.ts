import { execFileSync } from "node:child_process"
import fs from "node:fs"

import type { Page } from "@playwright/test"

import {
  expect,
  test,
  openGrid,
  rowData,
  setFilterModel,
} from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

async function exportVia(page: Page, label: RegExp, section: "Visible" | "All") {
  await page.getByRole("button", { name: "Export" }).click()
  const group = page.getByRole("group").filter({ hasText: section === "Visible" ? "Visible rows" : "All rows" })
  const download = page.waitForEvent("download")
  await group.getByRole("menuitem", { name: label }).click()
  const file = await (await download).path()
  return fs.readFileSync(file!)
}

test("CSV: UTF-8 BOM, raw numbers, ISO dates, quoted multi-line text, formula guard", async ({ page }) => {
  const buf = await exportVia(page, /CSV/, "All")
  expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const csv = buf.toString("utf8").slice(1)
  const [header] = csv.split("\r\n")
  expect(header).toBe('"SKU","Customer","Region","Product","Qty","Unit price","Total","Order date","Shipped","Notes"')
  const r0 = (await rowData(page, 0))!
  expect(csv).toContain(
    `"${r0.sku}","${r0.customer}","${r0.region}","${r0.product}","${r0.quantity}","${r0.unitPrice}",`
  )
  expect(csv).toContain(`"${r0.orderDate}","${r0.shipped ? "TRUE" : "FALSE"}"`)
  expect(csv).toContain('"Line 1 of address\nLine 2 of address"')
  expect(csv).toContain('"Customer asked for ""express"" shipping"')
  expect(csv).toContain(`"'=SUM(A1:A2) is just text here"`)
  expect(csv).toContain("Müller & Söhne GmbH")
})

test("CSV of visible rows respects filters", async ({ page }) => {
  await setFilterModel(page, { region: { filterType: "set", values: ["North"] } })
  const csv = (await exportVia(page, /CSV/, "Visible")).toString("utf8")
  const lines = csv.trim().split("\r\n").slice(1)
  expect(lines.length).toBeGreaterThan(5)
  for (const l of lines.filter((l) => l.startsWith('"'))) expect(l.split('","')[2]).toBe("North")
})

test("xlsx keeps real types", async ({ page }) => {
  const buf = await exportVia(page, /Excel/, "All")
  const file = test.info().outputPath("orders.xlsx")
  fs.writeFileSync(file, buf)
  const script = `
import json, sys, datetime, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb["Orders"]
rows = list(ws.iter_rows(min_row=1, max_row=3, values_only=True))
def enc(v):
    if isinstance(v, datetime.datetime): return {"date": v.date().isoformat()}
    return v
print(json.dumps({
  "header": rows[0],
  "row1": [enc(v) for v in rows[1]],
  "row2": [enc(v) for v in rows[2]],
  "freeze": ws.freeze_panes,
  "rows": ws.max_row,
  "fmt": [ws.cell(2, c).number_format for c in range(1, 11)],
}))`
  const out = JSON.parse(execFileSync("python3", ["-c", script, file]).toString())
  const r0 = (await rowData(page, 0))!
  const r1 = (await rowData(page, 1))!
  expect(out.header).toEqual(["SKU", "Customer", "Region", "Product", "Qty", "Unit price", "Total", "Order date", "Shipped", "Notes"])
  expect(out.row1).toEqual([
    r0.sku, // string, leading zeros intact
    r0.customer,
    r0.region,
    r0.product,
    r0.quantity,
    r0.unitPrice,
    Math.round(r0.quantity! * r0.unitPrice! * 100) / 100,
    { date: r0.orderDate },
    r0.shipped,
    r0.notes || null,
  ])
  expect(out.row2[9]).toBe(r1.notes) // multi-line text intact
  expect(out.rows).toBe(251)
  expect(out.freeze).toBe("B2")
  expect(out.fmt[4]).toBe("#,##0")
  expect(out.fmt[5]).toBe('"$"#,##0.00')
  expect(out.fmt[7]).toBe("yyyy-mm-dd")
})
