
import {
  expect,
  test,
  clickCell,
  displayedCount,
  displayedIds,
  openGrid,
  paste,
  rowById,
  rowData,
  setFilterModel,
} from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

const NORTH = { region: { filterType: "set", values: ["North"] } }

test("column filter from the filter button in the header cell", async ({ page }) => {
  await page.locator('.ag-header-cell[col-id="sku"] .ag-header-cell-filter-button').click()
  const popup = page.locator(".ag-popup .ag-filter").last()
  await expect(popup).toBeVisible()
  await popup.locator(".ag-mini-filter input").fill("000")
  await expect.poll(() => displayedCount(page), { timeout: 5000 }).toBeLessThan(250)
  const ids = await displayedIds(page)
  for (const id of ids) expect((await rowById(page, id))!.sku).toContain("000")
  await expect(page.getByTestId("row-count")).toContainText(`of 250 rows`)
})

test("one header row: each cell reads title, filter button, menu button", async ({ page }) => {
  await expect(page.locator(".ag-floating-filter")).toHaveCount(0)
  const headers = page.locator(".ag-header-cell[col-id]:not([col-id='ag-Grid-RowNumbersColumn'])")
  const count = await headers.count()
  expect(count).toBeGreaterThanOrEqual(9)
  for (let i = 0; i < count; i++) {
    const header = headers.nth(i)
    const colId = await header.getAttribute("col-id")
    const x = await header.evaluate((h) =>
      [".ag-header-cell-text", ".ag-header-cell-filter-button", ".ag-header-cell-menu-button"].map((sel) => {
        const el = h.querySelector(sel) as HTMLElement | null
        return el && el.offsetParent ? el.getBoundingClientRect().x : null
      })
    )
    expect(x.every((v) => v != null), `${colId} has title, filter and menu`).toBe(true)
    expect(x[0]! < x[1]! && x[1]! < x[2]!, `${colId} order`).toBe(true)
    // the title is readable, not truncated by the buttons
    const truncated = await header.locator(".ag-header-cell-text").evaluate((t) => t.scrollWidth > t.clientWidth)
    expect(truncated, `${colId} title fits`).toBe(false)
  }
})

test("an active filter is marked on its header filter button", async ({ page }) => {
  const button = page.locator('.ag-header-cell[col-id="region"] .ag-header-cell-filter-button')
  await expect(button).not.toHaveClass(/ag-filter-active/)
  await setFilterModel(page, NORTH)
  await expect(button).toHaveClass(/ag-filter-active/)
})

test("set filter from the column menu", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const ids = await displayedIds(page)
  expect(ids.length).toBeGreaterThan(10)
  for (const id of ids) expect((await rowById(page, id))!.region).toBe("North")
  await expect(page.getByRole("button", { name: /Clear filters/ })).toBeEnabled()
  await page.getByRole("button", { name: /Clear filters/ }).click()
  await expect.poll(() => displayedCount(page)).toBe(250)
})

test("global filter searches every column including formatted values", async ({ page }) => {
  const search = page.getByLabel("Global filter")
  await search.fill("Globex")
  await expect.poll(() => displayedCount(page)).toBeGreaterThan(0)
  for (const id of await displayedIds(page)) expect((await rowById(page, id))!.customer).toBe("Globex")

  await search.fill("$1,499.99")
  await expect.poll(async () => {
    const ids = await displayedIds(page)
    return ids.length > 0 && (await Promise.all(ids.map((id) => rowById(page, id)))).every((r) => r!.unitPrice === 1499.99)
  }).toBe(true)

  await search.press("Escape")
  await expect.poll(() => displayedCount(page)).toBe(250)
})

test("new rows stay visible while a column filter is active", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const before = await displayedCount(page)
  await clickCell(page, 0, "customer")
  await page.getByRole("button", { name: "Add row" }).click()
  await page.keyboard.type("NEW1")
  await page.keyboard.press("Enter")
  await expect.poll(() => displayedCount(page)).toBe(before + 1)
  await expect(page.getByTestId("kept-banner")).toContainText("1 row is shown outside")
  await expect(page.locator(".ag-row.row-kept-visible").first()).toBeVisible()
})

test("rows edited out of the filter don't vanish — even after later transactions", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const before = await displayedCount(page)
  const target = (await rowData(page, 0))!
  // edit the row so it no longer matches Region = North
  await clickCell(page, 0, "region")
  await paste(page, "South")
  await expect.poll(async () => (await rowById(page, target.id))?.region).toBe("South")
  // a transaction re-runs the filter: this is where rows normally disappear
  await page.getByRole("button", { name: "Add row" }).click()
  await page.keyboard.press("Escape")
  await expect.poll(() => displayedCount(page)).toBe(before + 1)
  expect(await displayedIds(page)).toContain(target.id)
})

test("pasted rows (including overflow rows) stay visible under a filter", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const count = await displayedCount(page)
  await page.evaluate((i) => window.__gridApi.ensureIndexVisible(i), count - 1)
  await clickCell(page, count - 1, "region")
  await paste(page, "West\r\nEast\r\nSouth\r\n")
  await expect.poll(() => displayedCount(page)).toBe(count + 2)
  await expect(page.getByTestId("kept-banner")).toContainText("3 rows are shown")
})

test("changing the filter or re-applying evaluates it against all rows again", async ({ page }) => {
  await setFilterModel(page, NORTH)
  const before = await displayedCount(page)
  const target = (await rowData(page, 0))!
  await clickCell(page, 0, "region")
  await paste(page, "South")
  await expect.poll(async () => (await rowById(page, target.id))?.region).toBe("South")
  expect(await displayedCount(page)).toBe(before)

  await page.getByRole("button", { name: "Re-apply filter" }).click()
  await expect.poll(() => displayedCount(page)).toBe(before - 1)
  expect(await displayedIds(page)).not.toContain(target.id)
  await expect(page.getByTestId("kept-banner")).toHaveCount(0)
})

test("works with the global filter too", async ({ page }) => {
  await page.getByLabel("Global filter").fill("Globex")
  await expect.poll(() => displayedCount(page)).toBeLessThan(250)
  const before = await displayedCount(page)
  await clickCell(page, 0, "customer")
  await page.getByRole("button", { name: "Add row" }).click()
  await page.keyboard.press("Escape")
  await expect.poll(() => displayedCount(page)).toBe(before + 1)
  // typing a new search is a new query
  await page.getByLabel("Global filter").fill("Globe")
  await expect.poll(() => displayedCount(page)).toBe(before)
})

test("switch off → AG Grid's default behaviour (row disappears)", async ({ page }) => {
  await page.getByLabel("Keep new & edited rows visible while filtered").click()
  await setFilterModel(page, NORTH)
  const before = await displayedCount(page)
  await clickCell(page, 0, "customer")
  await page.getByRole("button", { name: "Add row" }).click()
  await page.keyboard.press("Escape")
  await expect.poll(() => displayedCount(page)).toBe(before)
})

test("column pinning is fixed in code: SKU pinned left, no Pin Column option", async ({ page }) => {
  const pinned = await page.evaluate(() =>
    window.__gridApi
      .getColumnState()
      .filter((c: { pinned: string | null }) => c.pinned)
      .map((c: { colId: string; pinned: string }) => [c.colId, c.pinned])
  )
  expect(pinned).toEqual([
    ["ag-Grid-RowNumbersColumn", "left"],
    ["sku", "left"],
  ])
  for (const colId of ["sku", "customer"]) {
    await page.locator(`.ag-header-cell[col-id="${colId}"] .ag-header-cell-menu-button`).click()
    const menu = page.locator(".ag-menu").last()
    await expect(menu).toBeVisible()
    await expect(menu.getByText("Sort Ascending")).toBeVisible()
    await expect(menu.getByText("Pin Column")).toHaveCount(0)
    await page.keyboard.press("Escape")
  }
})

test("visible columns are fixed in code: no Choose Columns, drag-out doesn't hide", async ({ page }) => {
  const visible = () =>
    page.evaluate(() => window.__gridApi.getAllDisplayedColumns().map((c: { getColId(): string }) => c.getColId()))
  const before = await visible()
  for (const colId of ["sku", "customer", "notes"]) {
    await page.locator(`.ag-header-cell[col-id="${colId}"] .ag-header-cell-menu-button`).click()
    const menu = page.locator(".ag-menu").last()
    await expect(menu.getByText("Sort Ascending")).toBeVisible()
    await expect(menu.getByText("Choose Columns")).toHaveCount(0)
    // no leading, trailing or doubled separators left behind
    const kinds = await menu
      .locator(".ag-menu-list > *")
      .evaluateAll((els) => els.map((e) => (e.classList.contains("ag-menu-separator") ? "sep" : "item")))
    expect(kinds[0]).toBe("item")
    expect(kinds[kinds.length - 1]).toBe("item")
    expect(kinds.join(",")).not.toContain("sep,sep")
    await page.keyboard.press("Escape")
  }
  // drag the Region header well outside the grid and let go
  const header = page.locator('.ag-header-cell[col-id="region"] .ag-header-cell-text')
  const box = (await header.boundingBox())!
  await page.mouse.move(box.x + 5, box.y + 5)
  await page.mouse.down()
  await page.mouse.move(box.x + 5, box.y - 60, { steps: 10 })
  await page.mouse.move(box.x + 5, 5, { steps: 10 })
  await page.mouse.up()
  expect(await visible()).toEqual(before)
})

test("column order is fixed in code: dragging a header doesn't move it", async ({ page }) => {
  const order = () =>
    page.evaluate(() => window.__gridApi.getAllDisplayedColumns().map((c: { getColId(): string }) => c.getColId()))
  const before = await order()
  const from = (await page.locator('.ag-header-cell[col-id="region"] .ag-header-cell-text').boundingBox())!
  const to = (await page.locator('.ag-header-cell[col-id="unitPrice"] .ag-header-cell-text').boundingBox())!
  await page.mouse.move(from.x + 5, from.y + 5)
  await page.mouse.down()
  await page.mouse.move(to.x + 20, to.y + 5, { steps: 15 })
  await page.mouse.up()
  expect(await order()).toEqual(before)
})
