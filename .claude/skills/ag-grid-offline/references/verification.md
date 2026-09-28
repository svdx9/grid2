# Verifying grid behaviour

Grid work isn't done until it has run in a browser. Unit tests can't see
unregistered modules, clipboard behaviour or focus bugs.

## 1. Static: modules

```bash
node .claude/skills/ag-grid-offline/scripts/check-modules.mjs src
```

## 2. Browser: fail on any AG Grid error or warning

Playwright fixture — every test fails if AG Grid logs an error/warning or the
page throws. This is what surfaces missing modules and deprecated options.

```ts
import { test as base, expect } from "@playwright/test"

export const test = base.extend<{ gridConsole: void }>({
  gridConsole: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on("console", (m) => {
        if (/^AG Grid: (error|warning)/.test(m.text())) problems.push(m.text().slice(0, 300))
      })
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
      await use()
      expect(problems, "AG Grid console errors/warnings").toEqual([])
    },
    { auto: true },
  ],
})
export { expect }
```

Config essentials:

```ts
use: {
  permissions: ["clipboard-read", "clipboard-write"],   // real copy/paste
  acceptDownloads: true,                                  // exports
  launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
}
```

## 3. Test-writing pitfalls with AG Grid

- **Expose the API in dev only** (`if (import.meta.env.DEV) window.__gridApi = api`)
  and assert on `node.data`, not on rendered text.
- **Row animation** briefly leaves two rows with the same `row-index` after a
  filter/sort change. Wait for exactly one match before clicking:
  `await expect(locator).toHaveCount(1)`.
- **Overlay scrollbar** covers the bottom of the last visible row; click near
  a cell's top-left (`click({ position: { x: 6, y: 6 } })`).
- **Pinned columns** split a row across containers; select cells with
  `.ag-row[row-index="3"] .ag-cell[col-id="price"]`.
- **Clipboard:** write with `navigator.clipboard.writeText` in the page, then
  press `ControlOrMeta+V`; read back with `readText()` / `read()` for HTML.
  Grid copies end lines with `\r\n`.
- Poll for results of async operations (`expect.poll`) — paste is async.
- **Exports:** capture `page.waitForEvent("download")`, then parse the file
  (CSV text incl. BOM; xlsx with openpyxl — see `export.md`).

