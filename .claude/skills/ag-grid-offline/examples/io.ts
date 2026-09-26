import type {
  Column,
  ExcelStyle,
  GridApi,
  ProcessCellForExportParams,
  SendToClipboardParams,
} from "ag-grid-community"

import {
  buildExcelHtml,
  parseTsv,
  quoteTsvField,
  type ExcelCellKind,
} from "./clipboard"
import { COLUMN_META } from "./columns"
import type { Order } from "./data"

const kindOf = (column: Column): ExcelCellKind =>
  COLUMN_META[column.getColId()]?.kind ?? "text"

/**
 * Canonical, locale-independent text for a value. Used for the clipboard, the
 * fill handle and CSV, and always parseable by our own value parsers — so
 * grid → clipboard → grid is lossless, and Excel recognises every value
 * (raw numbers, ISO dates, TRUE/FALSE) whatever its regional settings.
 */
function canonicalText(kind: ExcelCellKind, value: unknown): string {
  if (value == null) return ""
  switch (kind) {
    case "number":
    case "currency":
      return String(value)
    case "boolean":
      return value ? "TRUE" : "FALSE"
    case "date":
      return String(value).slice(0, 10)
    default:
      return String(value)
  }
}

// ───────────────────────────── clipboard ─────────────────────────────

export function processCellForClipboard(params: ProcessCellForExportParams<Order>) {
  const text = canonicalText(kindOf(params.column), params.value)
  // 'dragCopy' (Ctrl+D / fill) is fed straight back into our parsers. Anything
  // else ends up on the OS clipboard as TSV and needs Excel-style quoting
  // (note: AG Grid reports range copies as type 'csv', not 'clipboard').
  return params.type === "dragCopy" ? text : quoteTsvField(text)
}

/** Serial day number Excel uses for dates (1900 date system). */
function isoToExcelSerial(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569
}

/**
 * Work out which column each copied TSV column came from, so the HTML flavour
 * can carry per-cell types. Mirrors AG Grid's copy logic for the common cases
 * (one cell range, or just the focused cell); returns null otherwise.
 */
function copiedColumns(api: GridApi<Order>, rows: string[][]) {
  const ranges = api.getCellRanges() ?? []
  const displayed = api.getAllDisplayedColumns()
  let columns: Column[]
  let rowCount: number
  if (ranges.length === 1) {
    const r = ranges[0]
    if (!r.startRow || !r.endRow) return null
    columns = [...r.columns].sort((a, b) => displayed.indexOf(a) - displayed.indexOf(b))
    rowCount = Math.abs(r.endRow.rowIndex - r.startRow.rowIndex) + 1
  } else if (ranges.length === 0) {
    const focused = api.getFocusedCell()
    if (!focused) return null
    columns = [focused.column]
    rowCount = 1
  } else {
    return null
  }
  if (rows.some((r) => r.length !== columns.length)) return null
  if (rows.length === rowCount) return { columns, hasHeader: false }
  if (rows.length === rowCount + 1) return { columns, hasHeader: true }
  return null
}

function buildHtmlFlavour(api: GridApi<Order>, tsv: string): string | null {
  const rows = parseTsv(tsv.replace(/\r?\n$/, ""))
  const info = copiedColumns(api, rows)
  if (!info) return null
  const kinds = rows.map((_, r) =>
    info.columns.map((c) => (info.hasHeader && r === 0 ? ("header" as const) : kindOf(c)))
  )
  return buildExcelHtml(rows, kinds, (kind, value) => {
    if (value === "") return undefined
    if (kind === "date") {
      const serial = isoToExcelSerial(value)
      return serial == null ? undefined : { num: String(serial) }
    }
    if (kind === "number" || kind === "currency") return { num: value }
    if (kind === "boolean") return { bool: value }
    return undefined
  })
}

/**
 * Put both `text/plain` (TSV) and `text/html` (typed table) on the clipboard.
 * Uses the synchronous copy-event path first: it works on every browser
 * without a permission prompt because it runs inside the user's keystroke.
 */
export function sendToClipboard({ api, data }: SendToClipboardParams<Order>) {
  const html = buildHtmlFlavour(api, data)

  let handled = false
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return
    e.clipboardData.setData("text/plain", data)
    if (html) e.clipboardData.setData("text/html", html)
    e.preventDefault()
    handled = true
  }
  const active = document.activeElement as HTMLElement | null
  document.addEventListener("copy", onCopy, true)
  try {
    document.execCommand("copy")
  } catch {
    /* fall through to the async API */
  } finally {
    document.removeEventListener("copy", onCopy, true)
  }
  active?.focus({ preventScroll: true })
  if (handled) return

  if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    navigator.clipboard
      .write([
        new ClipboardItem({
          "text/plain": new Blob([data], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ])
      .catch(() => navigator.clipboard.writeText(data))
  } else {
    void navigator.clipboard?.writeText(data)
  }
}

// ───────────────────────────── CSV ─────────────────────────────

/** Formula-injection guard (OWASP): text that Excel would execute. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function processCellForCsv(params: ProcessCellForExportParams<Order>) {
  const kind = kindOf(params.column)
  const text = canonicalText(kind, params.value)
  if (kind === "text" && FORMULA_PREFIX.test(text)) return `'${text}`
  return text
}

// ───────────────────────────── Excel ─────────────────────────────

export function processCellForExcel(params: ProcessCellForExportParams<Order>) {
  const kind = kindOf(params.column)
  const v = params.value
  if (v == null || v === "") return ""
  switch (kind) {
    case "date":
      // DateTime cells must be ISO yyyy-mm-ddThh:mm:ss
      return `${String(v).slice(0, 10)}T00:00:00`
    case "boolean":
      return v ? 1 : 0
    default:
      return v
  }
}

export const excelStyles: ExcelStyle[] = [
  { id: "header", font: { bold: true }, interior: { color: "#F4F4F5", pattern: "Solid" } },
  // String type keeps leading zeros and stops "1-2" becoming a date
  { id: "xl-text", dataType: "String" },
  { id: "xl-wrap", alignment: { wrapText: true, vertical: "Top" } },
  { id: "xl-int", dataType: "Number", numberFormat: { format: "#,##0" } },
  { id: "xl-currency", dataType: "Number", numberFormat: { format: "$#,##0.00" } },
  { id: "xl-date", dataType: "DateTime", numberFormat: { format: "yyyy-mm-dd" } },
  { id: "xl-bool", dataType: "Boolean" },
]
