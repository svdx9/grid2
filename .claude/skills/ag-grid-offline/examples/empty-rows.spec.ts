import type { Page } from "@playwright/test"

import {
  allDisplayedCount,
  clickCell,
  displayedCount,
  emptyRowCount,
  expect,
  openGrid,
  paste,
  rowData,
  setFilterModel,
  test,
  totalCount,
} from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

const NORTH = { region: { filterType: "set", values: ["North"] } }

const isEmptyAt = (page: Page, index: number) =>
  page.evaluate((i) => {
    const api = window.__gridApi
    return api.getGridOption("context").isEmptyRow(api.getDisplayedRowAtIndex(i)?.id) as boolean
  }, index)

/** is the viewport filled with rows all the way down? */
const viewportFilled = (page: Page) =>
  page.evaluate(() => {
    const api = window.__gridApi
    const last = api.getDisplayedRowAtIndex(api.getDisplayedRowCount() - 1)
    return last.rowTop + last.rowHeight >= api.getVerticalPixelRange().bottom
  })

/** scroll to the very last row and let any new empty rows arrive */
async function scrollToEnd(page: Page) {
  const before = await allDisplayedCount(page)
  await page.evaluate(() => window.__gridApi.ensureIndexVisible(window.__gridApi.getDisplayedRowCount() - 1))
  await expect.poll(() => allDisplayedCount(page)).toBeGreaterThanOrEqual(before)
}

test("empty rows follow the data and continue the row numbers", async ({ page }) => {
  expect(await isEmptyAt(page, 249)).toBe(false)
  expect(await isEmptyAt(page, 250)).toBe(true)
  expect(await emptyRowCount(page)).toBeGreaterThanOrEqual(100)
  await page.evaluate(() => window.__gridApi.ensureIndexVisible(252))
  await expect(page.locator('.ag-row[row-index="250"] .ag-row-number-cell')).toHaveText("251")
  // an empty row shows nothing — not even an unticked checkbox
  await expect(page.locator('.ag-row[row-index="250"] .ag-cell[col-id="shipped"] .ag-checkbox-input-wrapper')).toBeHidden()
  await expect(page.getByTestId("row-count")).toHaveText("250 rows")
})

test("with a filter active, empty rows fill the space below the matching rows", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const matching = await displayedCount(page)
  expect(matching).toBeLessThan(80)
  expect(await isEmptyAt(page, matching - 1)).toBe(false)
  expect(await isEmptyAt(page, matching)).toBe(true)
  expect(await viewportFilled(page)).toBe(true)
  await expect(page.getByTestId("row-count")).toHaveText(`${matching} of 250 rows`)
})

test("the global filter is followed by empty rows too", async ({ page }) => {
  await page.getByLabel("Global filter").fill("Globex")
  await expect.poll(() => displayedCount(page)).toBeLessThan(40)
  const matching = await displayedCount(page)
  expect(await isEmptyAt(page, matching)).toBe(true)
  expect(await viewportFilled(page)).toBe(true)
})

test("scrolling to the end keeps adding empty rows, up to 1000", async ({ page }) => {
  const start = await emptyRowCount(page)
  await scrollToEnd(page)
  await expect.poll(() => emptyRowCount(page)).toBeGreaterThan(start)
  for (let i = 0; i < 12; i++) await scrollToEnd(page)
  await expect.poll(() => emptyRowCount(page)).toBe(1000)
  await scrollToEnd(page)
  expect(await emptyRowCount(page)).toBe(1000)
})

test("empty rows stay below the data when sorting", async ({ page }) => {
  for (const sort of ["asc", "desc"]) {
    await page.evaluate(
      (s) => window.__gridApi.applyColumnState({ state: [{ colId: "customer", sort: s }], defaultState: { sort: null } }),
      sort
    )
    expect(await isEmptyAt(page, 0)).toBe(false)
    expect(await isEmptyAt(page, 249)).toBe(false)
    expect(await isEmptyAt(page, 250)).toBe(true)
  }
})

test("typing into an empty row makes it a data row", async ({ page }) => {
  await page.evaluate(() => window.__gridApi.ensureIndexVisible(252))
  await clickCell(page, 250, "customer")
  await page.keyboard.type("Zed Ltd")
  await page.keyboard.press("Enter")
  await expect.poll(() => totalCount(page)).toBe(251)
  expect((await rowData(page, 250))?.customer).toBe("Zed Ltd")
  expect(await isEmptyAt(page, 250)).toBe(false)
  await expect(page.getByTestId("row-count")).toHaveText("251 rows")
  // undoing it turns it back into an empty row
  await page.keyboard.press("ControlOrMeta+Z")
  await expect.poll(() => totalCount(page)).toBe(250)
  expect(await isEmptyAt(page, 250)).toBe(true)
})

test("under a filter, a row typed into an empty row stays visible", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const matching = await displayedCount(page)
  await page.evaluate((i) => window.__gridApi.ensureIndexVisible(i, "middle"), matching)
  await clickCell(page, matching, "customer")
  await page.keyboard.type("Zed Ltd")
  await page.keyboard.press("Enter")
  await expect.poll(() => displayedCount(page)).toBe(matching + 1)
  await expect(page.getByTestId("kept-banner")).toContainText("1 row is shown")
})

test("empty rows can't be deleted and aren't exported", async ({ page }) => {
  await page.evaluate(() => window.__gridApi.ensureIndexVisible(255))
  await clickCell(page, 252, "customer")
  await page.getByRole("button", { name: "Delete rows" }).click()
  await expect(page.getByTestId("notice")).toContainText("Select cells in the rows you want to delete")
  const csv = await page.evaluate(() => window.__gridApi.getDataAsCsv({ shouldRowBeSkipped: (p: any) => p.context.isEmptyRow(p.node.id) }))
  expect(csv.trim().split("\r\n")).toHaveLength(251)
})

test("pasting past the very last row (at the 1000 cap) appends data rows", async ({ page }) => {
  for (let i = 0; i < 12; i++) await scrollToEnd(page)
  await expect.poll(() => emptyRowCount(page)).toBe(1000)
  const last = (await allDisplayedCount(page)) - 1
  await clickCell(page, last, "sku")
  await paste(page, "Z1\r\nZ2\r\nZ3\r\n")
  await expect.poll(() => totalCount(page)).toBe(253)
  await expect(page.getByTestId("notice")).toContainText("added 2 new rows")
})
