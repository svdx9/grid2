import { test as base, expect, type Page } from "@playwright/test"

import type { Order } from "../src/grid/data"

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __gridApi: any
  }
}

/**
 * Every test fails if AG Grid logs an error or warning (missing module,
 * deprecated option, invalid value…) or the page throws.
 */
export const test = base.extend<{ gridConsole: void }>({
  gridConsole: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on("console", (m) => {
        const text = m.text()
        if (/^AG Grid: (error|warning)/.test(text)) problems.push(text.slice(0, 300))
      })
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
      await use()
      expect(problems, "AG Grid console errors/warnings").toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function openGrid(page: Page) {
  await page.goto("/")
  await expect(page.locator(".ag-row[row-index='0']").first()).toBeVisible()
  await expect(page.getByTestId("row-count")).toHaveText("250 rows")
}

export const cell = (page: Page, rowIndex: number, colId: string) =>
  page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`)

/**
 * Click a cell once the grid has settled (rows animating out briefly share a
 * row-index with rows animating in). Clicks near the top-left so the overlay
 * scrollbar AG Grid draws over the last visible row can't intercept it.
 */
export async function clickCell(
  page: Page,
  rowIndex: number,
  colId: string,
  modifiers?: ("Shift" | "ControlOrMeta")[]
) {
  const target = cell(page, rowIndex, colId)
  await expect(target).toHaveCount(1)
  await target.click({ position: { x: 6, y: 6 }, modifiers })
}

export const rowData = (page: Page, rowIndex: number) =>
  page.evaluate((i) => window.__gridApi.getDisplayedRowAtIndex(i)?.data as Order | undefined, rowIndex)

export const rowById = (page: Page, id: string) =>
  page.evaluate((rid) => window.__gridApi.getRowNode(rid)?.data as Order | undefined, id)

export const displayedCount = (page: Page) =>
  page.evaluate(() => window.__gridApi.getDisplayedRowCount() as number)

export const totalCount = (page: Page) =>
  page.evaluate(() => {
    let n = 0
    window.__gridApi.forEachNode(() => n++)
    return n
  })

export const displayedIds = (page: Page) =>
  page.evaluate(() => {
    const ids: string[] = []
    window.__gridApi.forEachNodeAfterFilterAndSort((n: { id: string }) => ids.push(n.id))
    return ids
  })

export const setClipboard = (page: Page, text: string) =>
  page.evaluate((t) => navigator.clipboard.writeText(t), text)

export const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText())

export async function readClipboardHtml(page: Page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (item.types.includes("text/html")) return await (await item.getType("text/html")).text()
    }
    return null
  })
}

/** click a cell, then shift-click another to make a range */
export async function selectRange(page: Page, from: [number, string], to: [number, string]) {
  await clickCell(page, from[0], from[1])
  await clickCell(page, to[0], to[1], ["Shift"])
}

export async function paste(page: Page, text: string) {
  await setClipboard(page, text)
  await page.keyboard.press("ControlOrMeta+V")
}

export async function copy(page: Page) {
  await page.keyboard.press("ControlOrMeta+C")
}

export async function setFilterModel(page: Page, model: unknown) {
  await page.evaluate((m) => window.__gridApi.setFilterModel(m), model)
}
