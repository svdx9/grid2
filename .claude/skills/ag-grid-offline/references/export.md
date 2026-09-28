# CSV and Excel export

Verified against AG Grid 36.2.0.

## Both

- Call `api.stopEditing()` first, or a cell being edited exports its old value.
- `exportedRows` defaults to `'filteredAndSorted'`; pass `'all'` for
  everything. Offer both explicitly — users don't expect filters to apply.
- A custom `processCellCallback` replaces the `valueFormatter` for export, so
  handle every column kind in it.

## CSV (`CsvExportModule`, community)

- AG Grid writes a UTF-8 BOM (`﻿`), so Excel opens non-ASCII text
  correctly. Re-verify: `ag-lookup.mjs source "uFEFF"`.
- Export canonical values: raw numbers (no currency/grouping), ISO dates,
  `TRUE`/`FALSE`. Values are quoted and embedded quotes doubled by default;
  newlines stay inside the quoted field.
- **Formula injection:** text starting with `=`, `+`, `-`, `@`, tab or CR is
  executed by Excel. Prefix text-column values with `'` (OWASP guidance) —
  only for text columns, so negative numbers stay numbers.
- Leading zeros are lost when Excel *opens* a CSV; that's inherent to CSV.
  Use xlsx when types matter.

## Excel (`ExcelExportModule`, enterprise)

- `excelStyles` is `@initial` — set it at creation. A column's `cellClass`
  names select the style ids (they also land on the DOM cell; harmless).
- Style `dataType` decides the cell type:
  - `String` → keeps `00123`, stops Excel re-typing text;
  - `Number` + `numberFormat` (`"#,##0"`, `"$#,##0.00"`);
  - `DateTime` → the processed value **must** be `yyyy-mm-ddThh:mm:ss`
    (return `` `${iso}T00:00:00` ``), plus `numberFormat: { format: "yyyy-mm-dd" }`;
  - `Boolean` → return `1`/`0` from `processCellCallback` (a string like
    `"TRUE"` produces an invalid cell).
- Write currency formats **unquoted**: `$#,##0.00`. The quoted form
  `"$"#,##0.00` is double-escaped into the file (`""$""#,##0.00`).
- `autoConvertFormulas` is off by default, so `=text` is exported as text.
- `freezeRows: 'headers'`, `freezeColumns: 'pinned'` give Excel-like frozen
  panes.
- Multi-line text: add an alignment style with `wrapText: true`.

## Verify the file, don't trust it

Read the downloaded workbook back and assert types, formats and freeze panes.
With Python available (`pip install openpyxl`):

```python
import openpyxl, datetime
ws = openpyxl.load_workbook(path)["Orders"]
row = [c.value for c in ws[2]]
assert isinstance(row[0], str) and row[0].startswith("0")    # SKU text
assert isinstance(row[7], datetime.datetime)                  # real date
assert ws.cell(2, 6).number_format == "$#,##0.00"
assert ws.freeze_panes == "B2"
```

In Playwright: `const file = await (await page.waitForEvent("download")).path()`
after clicking export, then run a check like the one above on it.
