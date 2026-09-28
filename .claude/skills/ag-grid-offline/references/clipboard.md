# Clipboard, cell ranges and the Excel round trip

Verified against AG Grid 36.2.0 (Enterprise `ClipboardModule`,
`CellSelectionModule`). Each item lists how to re-verify on another version.

## How paste works (read this first)

`Ctrl+V` → `navigator.clipboard.readText()` (falls back to a hidden textarea
if blocked) → AG Grid tokenizes the text (`stringToArray`) →
`processDataFromClipboard(params)` → optional trailing-line removal →
paste into the focused cell or the selected range → for each cell,
`processCellFromClipboard` **or** `colDef.valueParser` → `setDataValue(…, 'paste')`
→ `pasteEnd` event.

Re-verify: `ag-lookup.mjs source "processClipboardData\(data\)" -C 30`.

## Rules

1. **Excel's trailing line break.** Excel (and Google Sheets) end every copied
   range with `\r\n`. AG Grid turns that into a final `[""]` row. Effects:
   a single copied cell no longer fills a selected range (it isn't "one
   value" any more), and pasting a block writes `""` into the first column of
   the row below. Fix: `suppressLastEmptyLineOnPaste: true`, or strip trailing
   `[""]` rows yourself in `processDataFromClipboard` (which sees the data
   *before* that option is applied).

2. **Quoted cells keep their quotes (36.2).** Excel copies a cell containing a
   newline, tab or leading quote as `"Line A⏎Line ""B"""`. AG Grid's tokenizer
   splits rows/cells correctly but leaves the quote characters in the value.
   Its fields are otherwise the verbatim raw text, so unquote each field in
   `processDataFromClipboard`:

   ```ts
   /** Excel's quoting: needed for tab/CR/LF or a leading quote */
   const quoteTsvField = (v: string) =>
     /[\t\r\n]/.test(v) || v.startsWith('"') ? `"${v.replace(/"/g, '""')}"` : v

   /** undo it — only for well-formed quoted fields (inner quotes all doubled) */
   function unquoteTsvField(f: string) {
     if (f.length >= 2 && f.startsWith('"') && f.endsWith('"')) {
       const inner = f.slice(1, -1)
       if (!/(^|[^"])"("")*([^"]|$)/.test(inner)) return inner.replace(/""/g, '"')
     }
     return f
   }
   ```

   Pin the AG Grid version and keep the unit test that runs a copy of the
   tokenizer, so an upgrade that fixes this is noticed (double-unquoting
   would corrupt values that really are quoted).
   Re-verify: `source "function stringToArray" -C 45`.

3. **Copies are unquoted.** Range copies serialize with `suppressQuotes: true`,
   so a multi-line cell splits into several rows in Excel. Quote any value
   containing tab/CR/LF or starting with `"` (Excel's rule) in
   `processCellForClipboard`.
   Re-verify: `source "suppressQuotes: true" -C 12`.

4. **`processCellForClipboard` `type` values.** Range copies call it with
   `type: 'csv'` — *not* `'clipboard'`. Fill handle and Ctrl+D use
   `'dragCopy'`, and that output is fed straight back into the parser. So:
   quote for everything except `'dragCopy'`.

5. **Formatter/parser bypass.** Supplying `processCellForClipboard` means the
   `valueFormatter` is not used for copies; supplying `processCellFromClipboard`
   means `valueParser` is not used for pastes (`useValueFormatterForExport` /
   `useValueParserForImport` only apply without them). Recommended:
   - copy **canonical** text — raw numbers (`1234.5`), ISO dates
     (`2026-09-26`), `TRUE`/`FALSE` — never locale display strings;
   - do **not** set `processCellFromClipboard`; parse in `valueParser`.

6. **Parse what Excel actually emits**, locale-aware: `1,234.50`,
   `$1,234.50`, `(12)`, `12-`, `12%`, `1.2E+05`, `1.234,50` (comma-decimal
   locales), `26/09/2026` vs `9/26/2026` (unambiguous when a part > 12,
   otherwise the browser locale's order), `26-Sep-2026`, `Sep 26, 2026`,
   Excel serial numbers, `TRUE/FALSE/yes/no/1/0`. Invalid → keep
   `oldValue` and tell the user. Unit-test the parser against these inputs
   for at least one dot-decimal and one comma-decimal locale.

7. **Paste past the last row is dropped** silently. To grow the grid: in
   `processDataFromClipboard` work out the anchor (top-left of a multi-cell
   range, else the focused cell), split off rows beyond
   `getDisplayedRowCount()`, and append them with `applyTransaction` on
   `pasteEnd`. Range tiling rule: if the range height is an exact multiple of
   the clipboard height the data is tiled, never extended — don't split then.

8. **Filtered grids:** paste writes to *displayed* rows only (hidden rows are
   skipped). Rows edited by paste can then fail the filter on the next
   transaction — see `filtering.md`.

9. **Typed values for Excel.** Plain TSV loses types: SKU `00123` → `123`,
   dates interpreted per Excel's locale. Provide a `text/html` flavour via
   `sendToClipboard`: a `<table>` whose cells carry
   `mso-number-format:'\@'` (text), date/number formats, and `x:num` with
   locale-independent values. Writing both flavours synchronously from a
   `copy` event (`document.execCommand('copy')` + `clipboardData.setData`)
   works in every browser without a permission prompt.
   *Status: the HTML is verified to be produced; its interpretation by real
   Excel was not testable offline — check once manually.*

10. **`enableCellTextSelection: true` disables the clipboard service** (only
    selected text is copied). Don't combine it with range copy/paste.

11. Undo: a paste is one undo step with `undoRedoCellEditing`. Rows appended by
    your own transaction are not part of it.

## Checklist for a paste feature

- [ ] `ClipboardModule` + `CellSelectionModule` registered (`check-modules.mjs`)
- [ ] trailing empty row stripped, quoted fields unquoted
- [ ] `processCellForClipboard` returns canonical text, quotes except `dragCopy`
- [ ] parsing in `valueParser`, invalid → old value + notice
- [ ] overflow rows appended (or deliberately not)
- [ ] browser tests: single value fills range, block + trailing CRLF, quoted
      multi-line cell, grid→grid round trip equality, overflow, undo
