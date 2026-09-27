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

test("four-digit row numbers fit and are centred", async ({ page }) => {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.__gridApi.ensureIndexVisible(window.__gridApi.getDisplayedRowCount() - 1))
    await page.waitForTimeout(100)
  }
  await expect.poll(() => page.evaluate(() => window.__gridApi.getDisplayedRowCount())).toBe(1250)
  const last = rowNumberCell(page, 1249)
  await expect(last).toHaveText("1250")
  const fit = await last.evaluate((c) => ({ fits: c.scrollWidth <= c.clientWidth, align: getComputedStyle(c).textAlign }))
  expect(fit).toEqual({ fits: true, align: "center" })
})

/** the row number shown for each displayed row (read through the grid, not the DOM) */
const shownNumbers = (page: Page, count: number) =>
  page.evaluate((n) => {
    const api = window.__gridApi
    return Array.from({ length: n }, (_, i) =>
      Number(api.getCellValue({ rowNode: api.getDisplayedRowAtIndex(i), colKey: "ag-Grid-RowNumbersColumn" }))
    )
  }, count)

const displayedIdList = (page: Page) =>
  page.evaluate(() => {
    const ids: string[] = []
    window.__gridApi.forEachNodeAfterFilterAndSort((n: { id: string }) => ids.push(n.id))
    return ids
  })

const setSort = (page: Page, colId: string | null, sort?: "asc" | "desc") =>
  page.evaluate(
    ([c, s]) =>
      window.__gridApi.applyColumnState({ state: c ? [{ colId: c, sort: s }] : [], defaultState: { sort: null } }),
    [colId, sort] as const
  )

const NORTH = { region: { filterType: "set", values: ["North"] } }

test("filtering keeps each row's number (like Sheets)", async ({ page }) => {
  const unfiltered = await displayedIdList(page)
  await page.evaluate((m) => window.__gridApi.setFilterModel(m), NORTH)
  await expect.poll(async () => (await displayedIdList(page)).length).toBeLessThan(unfiltered.length)
  const filtered = await displayedIdList(page)
  const expected = filtered.slice(0, 20).map((id) => unfiltered.indexOf(id) + 1)
  expect(await shownNumbers(page, 20)).toEqual(expected)
  expect(expected[1] - expected[0]).toBeGreaterThan(1) // gaps, not 1, 2, 3
  // on screen too (once rows animating out have gone)
  await expect(rowNumberCell(page, 1)).toHaveCount(1)
  await expect(rowNumberCell(page, 0)).toHaveText(String(expected[0]))
  await expect(rowNumberCell(page, 1)).toHaveText(String(expected[1]))
})

test("the global filter keeps row numbers too, and empty rows continue after the data", async ({ page }) => {
  const unfiltered = await displayedIdList(page)
  await page.getByLabel("Global filter").fill("Globex")
  await expect.poll(async () => (await displayedIdList(page)).length).toBeLessThan(200)
  const filtered = await displayedIdList(page)
  const isEmpty = (id: string) => id.startsWith("empty-")
  const dataRows = filtered.filter((id) => !isEmpty(id))
  const numbers = await shownNumbers(page, dataRows.length + 2)
  expect(numbers.slice(0, dataRows.length)).toEqual(dataRows.map((id) => unfiltered.indexOf(id) + 1))
  expect(numbers.slice(dataRows.length)).toEqual([251, 252])
})

test("with no filter, numbers match the grid's own sort order for every column", async ({ page }) => {
  const columns = ["sku", "customer", "region", "product", "quantity", "unitPrice", "total", "orderDate", "shipped", "notes"]
  for (const colId of columns) {
    for (const dir of ["asc", "desc"] as const) {
      await setSort(page, colId, dir)
      const numbers = await shownNumbers(page, 250)
      expect(numbers, `${colId} ${dir}`).toEqual(Array.from({ length: 250 }, (_, i) => i + 1))
    }
  }
})

test("sorted and filtered: numbers are positions in the sorted, unfiltered order", async ({ page }) => {
  await setSort(page, "unitPrice", "desc")
  const sortedAll = await displayedIdList(page)
  await page.evaluate((m) => window.__gridApi.setFilterModel(m), NORTH)
  await expect.poll(async () => (await displayedIdList(page)).length).toBeLessThan(sortedAll.length)
  const filtered = (await displayedIdList(page)).filter((id) => !id.startsWith("empty-"))
  expect(await shownNumbers(page, filtered.length)).toEqual(filtered.map((id) => sortedAll.indexOf(id) + 1))
})
