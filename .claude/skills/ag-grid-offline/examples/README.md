# Examples — tested AG Grid 36.2 patterns (React)

Copies of the demo app in this repo (`src/grid/*`, `e2e/*`), where they are
covered by 74 unit tests and 34 Playwright tests. A repo test
(`tests/skill-examples.test.ts`) fails if these copies drift from the app.

| File | Shows |
| --- | --- |
| `DataGrid.tsx` | module list, paste overflow → new rows, filters bound to existing rows (`alwaysPassFilter`), focus-safe "add row", delete rows in a cell range, stable React props |
| `columns.ts` | one `valueParser` per column for typing/paste/fill, invalid → old value, editors, filters, quick-filter text for formatted values |
| `clipboard.ts` | Excel-style TSV quoting/unquoting, trailing-row stripping, `text/html` clipboard flavour |
| `io.ts` | canonical clipboard values, `sendToClipboard` writing text + HTML, CSV (formula guard) and Excel (`excelStyles`) processing |
| `locale.ts` | locale-aware parsing of Excel's number/date/boolean formats, safe locale detection |
| `theme.ts` | Theming API mapped to shadcn/ui CSS variables (light/dark with no JS) |
| `helpers.ts` + `*.spec.ts` | Playwright console fixture and tests for editing, clipboard, filtering, export |

Imports such as `@/components/ui/...` refer to the demo app; adapt paths.
