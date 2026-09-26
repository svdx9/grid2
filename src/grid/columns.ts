import type {
  ColDef,
  ValueFormatterParams,
  ValueParserParams,
} from "ag-grid-community"

import type { ExcelCellKind } from "./clipboard"
import { REGIONS, type Order } from "./data"
import {
  formatCurrency,
  formatInteger,
  formatIsoDate,
  parseBoolean,
  parseDate,
  parseNumber,
} from "./locale"

/** Grid-wide context: lets parsers report values they had to reject. */
export interface GridContext {
  onInvalidValue: (colId: string, raw: unknown) => void
}

export interface ColumnMeta {
  kind: ExcelCellKind
  /** raw clipboard/editor input → typed value; `undefined` = invalid */
  parse: (raw: unknown) => unknown
}

export type ParseResult = { ok: true; value: unknown } | { ok: false }

const parseText = (raw: unknown) => (raw == null ? "" : String(raw))

const parseRegion = (raw: unknown) => {
  if (raw == null || String(raw).trim() === "") return null
  const s = String(raw).trim().toLowerCase()
  return REGIONS.find((r) => r.toLowerCase() === s)
}

const parseQuantity = (raw: unknown) => {
  const n = parseNumber(raw)
  if (n == null) return n
  return Number.isInteger(n) ? n : undefined
}

const parseMoney = (raw: unknown) => {
  const n = parseNumber(raw)
  return n == null ? n : Math.round(n * 100) / 100
}

export const COLUMN_META: Record<string, ColumnMeta> = {
  sku: { kind: "text", parse: parseText },
  customer: { kind: "text", parse: parseText },
  region: { kind: "text", parse: parseRegion },
  product: { kind: "text", parse: parseText },
  quantity: { kind: "number", parse: parseQuantity },
  unitPrice: { kind: "currency", parse: parseMoney },
  total: { kind: "currency", parse: parseMoney },
  orderDate: { kind: "date", parse: (raw) => parseDate(raw) },
  shipped: { kind: "boolean", parse: (raw) => parseBoolean(raw) },
  notes: { kind: "text", parse: parseText },
}

export function parseForColumn(colId: string, raw: unknown): ParseResult {
  const meta = COLUMN_META[colId]
  if (!meta) return { ok: false }
  const value = meta.parse(raw)
  return value === undefined ? { ok: false } : { ok: true, value }
}

/**
 * One parser for typing, pasting, fill handle and Ctrl+D. Unparseable input
 * keeps the old value (instead of AG Grid's default of writing null/NaN) and
 * is reported so the UI can say what was skipped.
 */
function valueParser(params: ValueParserParams<Order>) {
  const colId = params.column.getColId()
  const result = parseForColumn(colId, params.newValue)
  if (!result.ok) {
    ;(params.context as GridContext | undefined)?.onInvalidValue(colId, params.newValue)
    return params.oldValue
  }
  return result.value
}

const excelClass: Record<ExcelCellKind, string> = {
  text: "xl-text",
  number: "xl-int",
  currency: "xl-currency",
  date: "xl-date",
  boolean: "xl-bool",
}

function col(field: string, def: ColDef<Order>): ColDef<Order> {
  const kind = COLUMN_META[field].kind
  return {
    field: field as ColDef<Order>["field"],
    colId: field,
    valueParser,
    cellClass: excelClass[kind],
    ...def,
  }
}

export const columnDefs: ColDef<Order>[] = [
  col("sku", {
    headerName: "SKU",
    cellDataType: "text",
    filter: "agTextColumnFilter",
    width: 100,
    pinned: "left",
  }),
  col("customer", {
    headerName: "Customer",
    cellDataType: "text",
    filter: "agSetColumnFilter",
    minWidth: 170,
    flex: 1,
  }),
  col("region", {
    headerName: "Region",
    cellDataType: "text",
    filter: "agSetColumnFilter",
    cellEditor: "agRichSelectCellEditor",
    cellEditorParams: { values: [...REGIONS], allowTyping: true, filterList: true, highlightMatch: true },
    width: 120,
  }),
  col("product", {
    headerName: "Product",
    cellDataType: "text",
    filter: "agSetColumnFilter",
    width: 130,
  }),
  col("quantity", {
    headerName: "Qty",
    cellDataType: "number",
    filter: "agNumberColumnFilter",
    cellEditor: "agNumberCellEditor",
    cellEditorParams: { precision: 0 },
    valueFormatter: (p: ValueFormatterParams<Order, number>) => formatInteger(p.value),
    width: 90,
    cellClass: ["xl-int", "tabular-nums"],
  }),
  col("unitPrice", {
    headerName: "Unit price",
    cellDataType: "number",
    filter: "agNumberColumnFilter",
    cellEditor: "agNumberCellEditor",
    cellEditorParams: { precision: 2 },
    valueFormatter: (p: ValueFormatterParams<Order, number>) => formatCurrency(p.value),
    getQuickFilterText: (p) => `${p.value ?? ""} ${formatCurrency(p.value)}`,
    width: 115,
    cellClass: ["xl-currency", "tabular-nums"],
  }),
  col("total", {
    headerName: "Total",
    field: undefined,
    valueGetter: (p) =>
      p.data && p.data.quantity != null && p.data.unitPrice != null
        ? Math.round(p.data.quantity * p.data.unitPrice * 100) / 100
        : null,
    cellDataType: "number",
    editable: false,
    filter: "agNumberColumnFilter",
    valueFormatter: (p: ValueFormatterParams<Order, number>) => formatCurrency(p.value),
    getQuickFilterText: (p) => `${p.value ?? ""} ${formatCurrency(p.value)}`,
    width: 120,
    cellClass: ["xl-currency", "tabular-nums", "text-muted-foreground"],
  }),
  col("orderDate", {
    headerName: "Order date",
    cellDataType: "dateString",
    filter: "agDateColumnFilter",
    cellEditor: "agDateStringCellEditor",
    valueFormatter: (p: ValueFormatterParams<Order, string>) => formatIsoDate(p.value),
    getQuickFilterText: (p) => `${p.value ?? ""} ${formatIsoDate(p.value)}`,
    width: 165,
    cellClass: ["xl-date", "tabular-nums"],
  }),
  col("shipped", {
    headerName: "Shipped",
    cellDataType: "boolean",
    filter: "agSetColumnFilter",
    filterParams: {
      valueFormatter: (p: { value: boolean | null }) =>
        p.value == null ? "(Blanks)" : p.value ? "Yes" : "No",
    },
    getQuickFilterText: (p) => (p.value ? "shipped" : ""),
    width: 100,
  }),
  col("notes", {
    headerName: "Notes",
    cellDataType: "text",
    filter: "agTextColumnFilter",
    cellEditor: "agLargeTextCellEditor",
    cellEditorPopup: true,
    cellEditorParams: { maxLength: 2000, rows: 6, cols: 50 },
    minWidth: 220,
    flex: 1.4,
    cellClass: ["xl-text", "xl-wrap"],
    tooltip: (p) => (p.value && String(p.value).includes("\n") ? String(p.value) : undefined),
  }),
]

export const defaultColDef: ColDef<Order> = {
  editable: true,
  sortable: true,
  resizable: true,
  floatingFilter: true,
  suppressHeaderMenuButton: false,
  enableCellChangeFlash: true,
}
