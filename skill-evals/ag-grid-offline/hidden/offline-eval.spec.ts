/**
 * Hidden acceptance tests for the offline eval. The agent never sees this
 * file; it only gets the task in ../task.md. Every test also fails on any
 * AG Grid console error/warning (e.g. a feature used without its module).
 */
import { test as base, expect, type Page } from "@playwright/test"

const test = base.extend<{ gridConsole: void }>({
  gridConsole: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on("console", (m) => {
        if (/^AG Grid: (error|warning)/.test(m.text())) problems.push(m.text().slice(0, 200))
      })
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
      await use()
      expect(problems, "AG Grid console errors/warnings").toEqual([])
    },
    { auto: true },
  ],
})

type Order = { id: string; sku: string; product: string; region: string | null; qty: number | null; notes: string }

const api = <T,>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(([f, a]) => new Function("api", "arg", `return (${f})(api, arg)`)((window as any).__gridApi, a), [fn, arg] as const) as Promise<T>
const rowData = (page: Page, i: number) => api<Order | undefined>(page, "(api, i) => api.getDisplayedRowAtIndex(i)?.data", i)
const displayedCount = (page: Page) => api<number>(page, "(api) => api.getDisplayedRowCount()")
const displayedIds = (page: Page) =>
  api<string[]>(page, "(api) => { const ids = []; api.forEachNodeAfterFilterAndSort(n => ids.push(n.id)); return ids }")

async function clickCell(page: Page, row: number, col: string, shift = false) {
  const cell = page.locator(`.ag-row[row-index="${row}"] .ag-cell[col-id="${col}"]`)
  await expect(cell).toHaveCount(1)
  await cell.click({ position: { x: 6, y: 6 }, modifiers: shift ? ["Shift"] : undefined })
}
async function paste(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text)
  await page.keyboard.press("ControlOrMeta+V")
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.locator(".ag-row[row-index='0']").first()).toBeVisible()
})

test("copy: a multi-line cell is quoted so Excel keeps it in one cell", async ({ page }) => {
  // row 3 has notes "Line one\nLine two"
  await clickCell(page, 3, "qty")
  await clickCell(page, 3, "notes", true)
  await page.keyboard.press("ControlOrMeta+C")
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\t"Line one\nLine two"$/)
})

test("paste: a single value copied from Excel fills the selected range", async ({ page }) => {
  await clickCell(page, 0, "product")
  await clickCell(page, 2, "product", true)
  await paste(page, "Alpha\r\n")
  await expect.poll(async () => (await rowData(page, 2))?.product).toBe("Alpha")
  expect((await rowData(page, 0))?.product).toBe("Alpha")
  expect((await rowData(page, 1))?.product).toBe("Alpha")
})

test("paste: Excel's trailing newline doesn't blank the row below", async ({ page }) => {
  const below = (await rowData(page, 2))!.product
  await clickCell(page, 0, "product")
  await paste(page, "One\r\nTwo\r\n")
  await expect.poll(async () => (await rowData(page, 1))?.product).toBe("Two")
  expect((await rowData(page, 2))?.product).toBe(below)
})

test("paste: a quoted multi-line cell from Excel arrives without quotes", async ({ page }) => {
  await clickCell(page, 0, "notes")
  await paste(page, '"First\nSecond ""quoted"""\r\n')
  await expect.poll(async () => (await rowData(page, 0))?.notes).toBe('First\nSecond "quoted"')
})

test('paste: Excel number formats like "1,200" are parsed', async ({ page }) => {
  await clickCell(page, 0, "qty")
  await paste(page, "1,200\r\n")
  await expect.poll(async () => (await rowData(page, 0))?.qty).toBe(1200)
})

test("filter: an added row stays visible while a filter is active", async ({ page }) => {
  await api(page, "(api) => api.setFilterModel({ region: { filterType: 'set', values: ['North'] } })")
  const before = await displayedCount(page)
  await page.getByTestId("add-row").click()
  await page.keyboard.press("Escape")
  await expect.poll(() => displayedCount(page)).toBe(before + 1)
})

test("filter: a row edited out of the filter survives a later add", async ({ page }) => {
  await api(page, "(api) => api.setFilterModel({ region: { filterType: 'set', values: ['North'] } })")
  const target = (await rowData(page, 0))!
  await clickCell(page, 0, "region")
  await paste(page, "South")
  await expect
    .poll(() => api<string>(page, "(api, id) => api.getRowNode(id)?.data.region", target.id))
    .toBe("South")
  await page.getByTestId("add-row").click()
  await page.keyboard.press("Escape")
  await expect.poll(() => displayedIds(page)).toContain(target.id)
})
