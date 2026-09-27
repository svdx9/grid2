import type { Page } from "@playwright/test"

import { copy, expect, openGrid, readClipboard, rowData, test, totalCount } from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

const rowNumberCell = (page: Page, rowIndex: number) =>
  page.locator(`.ag-row[row-index="${rowIndex}"] .ag-row-number-cell`)

/** press on one row number, drag down to another, release */
async function dragRowNumbers(page: Page, from: number, to: number) {
  const start = await rowNumberCell(page, from).boundingBox()
  const end = await rowNumberCell(page, to).boundingBox()
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2)
  await page.mouse.down()
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 8 })
  await page.mouse.up()
}

const selection = (page: Page) =>
  page.evaluate(() =>
    (window.__gridApi.getCellRanges() ?? []).map((r: any) => ({
      from: Math.min(r.startRow.rowIndex, r.endRow.rowIndex),
      to: Math.max(r.startRow.rowIndex, r.endRow.rowIndex),
      columns: r.columns.map((c: any) => c.getColId()),
    }))
  )

const DATA_COLUMNS = ["sku", "customer", "region", "product", "quantity", "unitPrice", "total", "orderDate", "shipped", "notes"]

test("shows a 1-based row number column on the far left", async ({ page }) => {
  await expect(rowNumberCell(page, 0)).toHaveText("1")
  await expect(rowNumberCell(page, 9)).toHaveText("10")
  const numberBox = await rowNumberCell(page, 0).boundingBox()
  const skuBox = await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="sku"]').boundingBox()
  expect(numberBox!.x).toBeLessThan(skuBox!.x)
})

test("clicking a row number selects the whole row", async ({ page }) => {
  await rowNumberCell(page, 3).click()
  expect(await selection(page)).toEqual([{ from: 3, to: 3, columns: DATA_COLUMNS }])
})

test("dragging down the row numbers selects those rows", async ({ page }) => {
  await dragRowNumbers(page, 1, 4)
  expect(await selection(page)).toEqual([{ from: 1, to: 4, columns: DATA_COLUMNS }])
})

test("selected rows copy as full rows and can be deleted", async ({ page }) => {
  await dragRowNumbers(page, 2, 3)
  await copy(page)
  const lines = (await readClipboard(page)).split("\r\n")
  expect(lines).toHaveLength(2)
  expect(lines[0].split("\t")[0]).toBe((await rowData(page, 2))!.sku)
  await page.getByRole("button", { name: "Delete rows" }).click()
  await expect.poll(() => totalCount(page)).toBe(248)
})

test("pasting whole rows into a row-number selection fills every column", async ({ page }) => {
  const source = (await rowData(page, 0))!
  await rowNumberCell(page, 0).click()
  await copy(page)
  await dragRowNumbers(page, 5, 6)
  await page.keyboard.press("ControlOrMeta+V")
  await expect.poll(async () => (await rowData(page, 6))?.sku).toBe(source.sku)
  const { id: _a, ...pasted } = (await rowData(page, 5))!
  const { id: _b, ...original } = source
  expect(pasted).toEqual(original)
})
