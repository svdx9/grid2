
import {
  expect,
  test,
  clickCell,
  copy,
  openGrid,
  paste,
  readClipboard,
  readClipboardHtml,
  rowData,
  selectRange,
  totalCount,
} from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

test("copying a range produces canonical, Excel-readable TSV", async ({ page }) => {
  await selectRange(page, [0, "quantity"], [1, "shipped"])
  await copy(page)
  const r0 = (await rowData(page, 0))!
  const r1 = (await rowData(page, 1))!
  const line = (r: typeof r0) =>
    [r.quantity, r.unitPrice, Math.round(r.quantity! * r.unitPrice! * 100) / 100, r.orderDate, r.shipped ? "TRUE" : "FALSE"].join("\t")
  await expect.poll(() => readClipboard(page)).toBe(`${line(r0)}\r\n${line(r1)}`)
})

test("multi-line and quoted text is quoted the way Excel does", async ({ page }) => {
  // row 1 has a two-line note
  const note = (await rowData(page, 1))!.notes
  expect(note).toContain("\n")
  await selectRange(page, [1, "customer"], [1, "notes"])
  await copy(page)
  const text = await readClipboard(page)
  expect(text.endsWith(`\t"${note.replace(/"/g, '""')}"`)).toBe(true)
})

test("clipboard carries a typed HTML table for Excel", async ({ page }) => {
  await selectRange(page, [0, "sku"], [0, "orderDate"])
  await copy(page)
  const html = await readClipboardHtml(page)
  expect(html).not.toBeNull()
  // SKU as text (keeps leading zeros), dates as serials, numbers raw
  expect(html).toMatch(/mso-number-format:'\\@';">0\d{4}<\/td>/)
  expect(html).toMatch(/x:num="\d{5}"/)
})

test("grid → clipboard → grid round trip is lossless", async ({ page }) => {
  const source = await Promise.all([0, 1, 2, 3].map((i) => rowData(page, i)))
  await selectRange(page, [0, "sku"], [3, "notes"])
  await copy(page)
  await clickCell(page, 10, "sku")
  await page.keyboard.press("ControlOrMeta+V")
  await expect
    .poll(async () => (await rowData(page, 13))?.notes)
    .toBe(source[3]!.notes)
  for (let i = 0; i < 4; i++) {
    const { id: _a, ...copied } = (await rowData(page, 10 + i))!
    const { id: _b, ...original } = source[i]!
    expect(copied).toEqual(original)
  }
})

test("a single value copied from Excel (with trailing newline) fills the selected range", async ({ page }) => {
  await selectRange(page, [0, "unitPrice"], [2, "unitPrice"])
  await paste(page, "$1,234.50\r\n")
  await expect.poll(async () => (await rowData(page, 2))?.unitPrice).toBe(1234.5)
  expect((await rowData(page, 0))?.unitPrice).toBe(1234.5)
  expect((await rowData(page, 1))?.unitPrice).toBe(1234.5)
})

test("Excel's trailing newline doesn't blank the row below", async ({ page }) => {
  const below = (await rowData(page, 2))!.customer
  await clickCell(page, 0, "customer")
  await paste(page, "Alpha\r\nBeta\r\n")
  await expect.poll(async () => (await rowData(page, 1))?.customer).toBe("Beta")
  expect((await rowData(page, 0))?.customer).toBe("Alpha")
  expect((await rowData(page, 2))?.customer).toBe(below)
})

test("Excel-formatted values are parsed into typed values", async ({ page }) => {
  await clickCell(page, 0, "quantity")
  const excelRows = [
    ["1,200", "$1,234.50", "", "26/09/2026", "TRUE"],
    ["(5)", "€ 3.10", "", "Sep 26, 2026", "FALSE"],
    ["7", "0.5", "", "46291", "yes"],
  ]
  await paste(page, excelRows.map((r) => r.join("\t")).join("\r\n") + "\r\n")
  await expect.poll(async () => (await rowData(page, 2))?.shipped).toBe(true)
  const [a, b, c] = await Promise.all([0, 1, 2].map((i) => rowData(page, i)))
  expect([a!.quantity, a!.unitPrice, a!.orderDate, a!.shipped]).toEqual([1200, 1234.5, "2026-09-26", true])
  expect([b!.quantity, b!.unitPrice, b!.orderDate, b!.shipped]).toEqual([-5, 3.1, "2026-09-26", false])
  expect([c!.quantity, c!.unitPrice, c!.orderDate, c!.shipped]).toEqual([7, 0.5, "2026-09-26", true])
})

test("quoted multi-line cell from Excel pastes into one cell", async ({ page }) => {
  await clickCell(page, 0, "notes")
  await paste(page, '"Line A\nLine ""B"""\r\nplain\r\n')
  await expect.poll(async () => (await rowData(page, 1))?.notes).toBe("plain")
  expect((await rowData(page, 0))?.notes).toBe('Line A\nLine "B"')
})

test("pasting past the last row appends new rows", async ({ page }) => {
  await page.evaluate(() => window.__gridApi.ensureIndexVisible(249))
  await clickCell(page, 249, "sku")
  await paste(page, "A1\tCust A\r\nA2\tCust B\r\nA3\tCust C\r\n")
  await expect.poll(() => totalCount(page)).toBe(252)
  expect((await rowData(page, 249))?.sku).toBe("A1")
  expect((await rowData(page, 250))?.customer).toBe("Cust B")
  expect((await rowData(page, 251))?.customer).toBe("Cust C")
  await expect(page.getByTestId("notice")).toContainText("added 2 new rows")
})

test("paste is a single undo step", async ({ page }) => {
  const before = await Promise.all([0, 1].map(async (i) => (await rowData(page, i))!.customer))
  await clickCell(page, 0, "customer")
  await paste(page, "X\r\nY")
  await expect.poll(async () => (await rowData(page, 1))?.customer).toBe("Y")
  await page.keyboard.press("ControlOrMeta+Z")
  await expect.poll(async () => (await rowData(page, 0))?.customer).toBe(before[0])
  expect((await rowData(page, 1))?.customer).toBe(before[1])
})

test("Ctrl+D fills down with typed values", async ({ page }) => {
  const first = (await rowData(page, 0))!
  await selectRange(page, [0, "unitPrice"], [3, "orderDate"])
  await page.keyboard.press("ControlOrMeta+D")
  for (const i of [1, 2, 3]) {
    const r = (await rowData(page, i))!
    expect(r.unitPrice).toBe(first.unitPrice)
    expect(r.orderDate).toBe(first.orderDate)
  }
})

test("cut clears the source cells", async ({ page }) => {
  await selectRange(page, [0, "customer"], [1, "customer"])
  await page.keyboard.press("ControlOrMeta+X")
  await expect.poll(async () => (await rowData(page, 0))?.customer).toBe("")
  expect((await rowData(page, 1))?.customer).toBe("")
})
