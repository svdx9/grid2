import type { Page } from "@playwright/test"

import { displayedCount, displayedIds, expect, openGrid, rowById, test } from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

async function openFilter(page: Page, colId: string) {
  await page.evaluate((c) => window.__gridApi.showColumnFilter(c), colId)
  const popup = page.locator(".ag-popup .ag-filter").last()
  await expect(popup).toBeVisible()
  return popup
}

const listItems = (popup: ReturnType<Page["locator"]>) => popup.locator(".ag-set-filter-item")

/** a value-list entry by its label ("East", "(Select All)", "2025") */
const listEntry = (popup: ReturnType<Page["locator"]>, label: string) =>
  popup.locator(".ag-virtual-list-item").filter({ has: popup.page().getByText(label, { exact: true }) })

test("value lists are in Excel (Mac) mode: Reset button, no Apply", async ({ page }) => {
  const popup = await openFilter(page, "region")
  await expect(popup.getByRole("button", { name: "Reset" })).toBeVisible()
  await expect(popup.getByRole("button", { name: "Apply" })).toHaveCount(0)
})

test("typing in the search box filters the grid straight away", async ({ page }) => {
  const popup = await openFilter(page, "region")
  await popup.locator(".ag-mini-filter input").fill("nor")
  await expect.poll(() => displayedCount(page), { timeout: 5000 }).toBeLessThan(250)
  for (const id of await displayedIds(page)) expect((await rowById(page, id))!.region).toBe("North")
})

test("ticking values applies without an Apply button", async ({ page }) => {
  const popup = await openFilter(page, "region")
  await listEntry(popup, "(Select All)").click()
  await listEntry(popup, "East").click()
  await expect.poll(() => displayedCount(page)).toBeLessThan(250)
  for (const id of await displayedIds(page)) expect((await rowById(page, id))!.region).toBe("East")
  // Reset brings everything back
  await popup.getByRole("button", { name: "Reset" }).click()
  await expect.poll(() => displayedCount(page)).toBe(250)
})

test("number lists show values the way the cells do, blanks last", async ({ page }) => {
  const popup = await openFilter(page, "unitPrice")
  const texts = await listItems(popup).allInnerTexts()
  expect(texts).toContain("$0.85")
  expect(texts).not.toContain("0.85")
  // scroll the virtual list to the end to see the last entry
  await popup.locator(".ag-virtual-list-viewport").evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(listItems(popup).last()).toHaveText("(Blanks)")
})

test('conditions sit in a "Number Filter" submenu above the list', async ({ page }) => {
  const popup = await openFilter(page, "unitPrice")
  await expect(popup.getByText("Number Filter")).toBeVisible()
  await page.evaluate(() =>
    window.__gridApi.setFilterModel({
      unitPrice: { filterType: "multi", filterModels: [{ filterType: "number", type: "greaterThan", filter: 100 }, null] },
    })
  )
  await expect.poll(() => displayedCount(page)).toBeLessThan(250)
  for (const id of await displayedIds(page)) expect((await rowById(page, id))!.unitPrice).toBeGreaterThan(100)
})

test("dates are a year › month › day tree", async ({ page }) => {
  const popup = await openFilter(page, "orderDate")
  const year = listEntry(popup, "2025")
  await expect(year).toHaveAttribute("role", "treeitem")
  await expect(year).toHaveAttribute("aria-expanded", "false")
  await expect(listEntry(popup, "2026")).toBeVisible()
})
