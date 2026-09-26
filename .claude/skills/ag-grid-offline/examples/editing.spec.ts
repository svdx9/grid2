
import {
  expect,
  test,
  clickCell,
  cell,
  openGrid,
  paste,
  rowData,
  selectRange,
} from "./helpers"

test.beforeEach(async ({ page }) => openGrid(page))

test("typing into a number cell commits a number and Enter moves down", async ({ page }) => {
  await clickCell(page, 0, "quantity")
  await page.keyboard.type("55")
  await page.keyboard.press("Enter")
  expect((await rowData(page, 0))?.quantity).toBe(55)
  await expect(cell(page, 1, "quantity")).toHaveClass(/ag-cell-focus/)
  // total recalculates from the edited quantity
  await expect(cell(page, 0, "total")).toHaveText("$398.75")
})

test("text edit, Escape cancels, F2 edits", async ({ page }) => {
  const before = (await rowData(page, 2))!.customer
  await cell(page, 2, "customer").dblclick()
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.type("Temporary")
  await page.keyboard.press("Escape")
  expect((await rowData(page, 2))!.customer).toBe(before)

  await clickCell(page, 2, "customer")
  await page.keyboard.press("F2")
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.type("Contoso")
  await page.keyboard.press("Tab")
  expect((await rowData(page, 2))!.customer).toBe("Contoso")
})

test("rich select editor only accepts known regions", async ({ page }) => {
  await cell(page, 0, "region").dblclick()
  await page.keyboard.type("wes")
  await page.keyboard.press("Enter")
  await expect.poll(async () => (await rowData(page, 0))?.region).toBe("West")
})

test("checkbox toggles with Space", async ({ page }) => {
  const before = (await rowData(page, 0))!.shipped
  await clickCell(page, 0, "shipped")
  await page.keyboard.press("Space")
  await expect.poll(async () => (await rowData(page, 0))?.shipped).toBe(!before)
})

test("date editor writes ISO strings", async ({ page }) => {
  await cell(page, 0, "orderDate").dblclick()
  const input = page.locator(".ag-cell-inline-editing input")
  await input.fill("2027-01-31")
  await page.keyboard.press("Enter")
  expect((await rowData(page, 0))?.orderDate).toBe("2027-01-31")
})

test("multi-line notes editor keeps newlines", async ({ page }) => {
  await cell(page, 0, "notes").dblclick()
  const textarea = page.locator(".ag-large-text textarea")
  await textarea.fill("first line\nsecond line")
  await page.keyboard.press("Tab")
  expect((await rowData(page, 0))?.notes).toBe("first line\nsecond line")
})

test("unparseable input keeps the old value and says so", async ({ page }) => {
  const before = (await rowData(page, 0))!.quantity
  await clickCell(page, 0, "quantity")
  await paste(page, "lots")
  await expect(page.getByTestId("notice")).toContainText("couldn't be parsed")
  expect((await rowData(page, 0))!.quantity).toBe(before)
})

test("undo / redo edits", async ({ page }) => {
  const before = (await rowData(page, 0))!.quantity
  await clickCell(page, 0, "quantity")
  await page.keyboard.type("9")
  await page.keyboard.press("Enter")
  expect((await rowData(page, 0))!.quantity).toBe(9)
  await page.getByRole("button", { name: "Undo" }).click()
  expect((await rowData(page, 0))!.quantity).toBe(before)
  await page.getByRole("button", { name: "Redo" }).click()
  expect((await rowData(page, 0))!.quantity).toBe(9)
})

test("add row inserts below focus and starts editing; delete removes selected rows", async ({ page }) => {
  await clickCell(page, 3, "customer")
  await page.getByRole("button", { name: "Add row" }).click()
  await expect(page.locator(".ag-cell-inline-editing")).toBeVisible()
  await page.keyboard.type("99999")
  await page.keyboard.press("Enter")
  const added = await rowData(page, 4)
  expect(added?.sku).toBe("99999")
  expect(added?.id).toMatch(/^new-/)
  await expect(page.getByTestId("row-count")).toHaveText("251 rows")

  await clickCell(page, 4, "customer")
  await clickCell(page, 5, "customer", ["Shift"])
  await page.getByRole("button", { name: "Delete rows" }).click()
  await expect(page.getByTestId("row-count")).toHaveText("249 rows")
})

test("Delete clears a selected range and is undoable", async ({ page }) => {
  const before = (await rowData(page, 1))!
  await selectRange(page, [0, "quantity"], [1, "unitPrice"])
  await page.keyboard.press("Delete")
  await expect.poll(async () => (await rowData(page, 1))?.unitPrice).toBeNull()
  expect((await rowData(page, 0))?.quantity).toBeNull()
  await expect(cell(page, 0, "total")).toHaveText("")
  await page.keyboard.press("ControlOrMeta+Z")
  await expect.poll(async () => (await rowData(page, 1))?.unitPrice).toBe(before.unitPrice)
})
