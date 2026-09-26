// Reference solution for the offline eval: proves the hidden tests are passable.
// Written from the ag-grid-offline skill's rules (clipboard.md, filtering.md, editing.md).
import {
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  NumberEditorModule,
  NumberFilterModule,
  RowApiModule,
  ScrollApiModule,
  TextEditorModule,
  TextFilterModule,
  ValidationModule,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type IRowNode,
  type ProcessCellForExportParams,
  type ValueParserParams,
} from "ag-grid-community"
import { CellSelectionModule, ClipboardModule, SetFilterModule } from "ag-grid-enterprise"
import { AgGridReact } from "ag-grid-react"
import { useCallback, useRef, useState } from "react"

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  RowApiModule,
  ScrollApiModule,
  TextEditorModule,
  NumberEditorModule,
  TextFilterModule,
  NumberFilterModule,
  SetFilterModule,
  CellSelectionModule,
  ClipboardModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])

export interface Order {
  id: string
  sku: string
  product: string
  region: string | null
  qty: number | null
  notes: string
}

const REGIONS = ["North", "South", "East", "West"]
const NOTES = ["", "Deliver to bay 3", 'Asked for "express"', "Line one\nLine two", "Net 30"]

const initialRows: Order[] = Array.from({ length: 30 }, (_, i) => ({
  id: `o${i + 1}`,
  sku: String(1000 + i * 7).padStart(5, "0"),
  product: ["Widget", "Gadget", "Gizmo"][i % 3],
  region: REGIONS[i % 4],
  qty: (i * 13) % 50,
  notes: NOTES[i % 5],
}))

const quote = (s: string) => (/[\t\r\n]/.test(s) || s.startsWith('"') ? `"${s.replace(/"/g, '""')}"` : s)
const unquote = (s: string) =>
  s.length >= 2 && s.startsWith('"') && s.endsWith('"') && !/(^|[^"])"("")*([^"]|$)/.test(s.slice(1, -1))
    ? s.slice(1, -1).replace(/""/g, '"')
    : s

function parseQty(p: ValueParserParams<Order>) {
  if (typeof p.newValue === "number") return p.newValue
  const s = String(p.newValue ?? "").trim()
  if (s === "") return null
  const n = Number(s.replace(/[,\s]/g, ""))
  return Number.isFinite(n) ? n : p.oldValue
}

const columnDefs: ColDef<Order>[] = [
  { field: "sku", headerName: "SKU", filter: "agTextColumnFilter" },
  { field: "product", filter: "agTextColumnFilter" },
  { field: "region", filter: "agSetColumnFilter" },
  { field: "qty", headerName: "Qty", cellDataType: "number", filter: "agNumberColumnFilter", valueParser: parseQty },
  { field: "notes", flex: 1 },
]
const defaultColDef: ColDef<Order> = { editable: true, floatingFilter: true }
const getRowId = ({ data }: { data: Order }) => data.id
const processCellForClipboard = (p: ProcessCellForExportParams<Order>) => {
  const text = p.value == null ? "" : String(p.value)
  return p.type === "dragCopy" ? text : quote(text)
}
const processDataFromClipboard = ({ data }: { data: string[][] }) => {
  const rows = data.map((r) => r.map(unquote))
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop()
  return rows
}

let seq = 0

export default function App() {
  const [rowData] = useState(initialRows)
  const apiRef = useRef<GridApi<Order> | null>(null)
  const kept = useRef(new Set<string>())
  const sig = useRef("")

  const alwaysPassFilter = useCallback((n: IRowNode<Order>) => !!n.id && kept.current.has(n.id), [])

  const onGridReady = (e: GridReadyEvent<Order>) => {
    apiRef.current = e.api
    if (import.meta.env.DEV) (window as unknown as { __gridApi: unknown }).__gridApi = e.api
  }

  const addRow = () => {
    const api = apiRef.current
    if (!api) return
    api.stopEditing()
    const row: Order = { id: `new-${++seq}`, sku: "", product: "", region: null, qty: null, notes: "" }
    if (api.isAnyFilterPresent()) kept.current.add(row.id)
    const node = api.applyTransaction({ add: [row], addIndex: 0 })?.add[0]
    if (node?.rowIndex != null) {
      api.ensureNodeVisible(node)
      api.setFocusedCell(node.rowIndex, "sku")
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div>
        <button data-testid="add-row" onClick={addRow}>
          Add row
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <AgGridReact<Order>
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          cellSelection
          stopEditingWhenCellsLoseFocus
          processCellForClipboard={processCellForClipboard}
          processDataFromClipboard={processDataFromClipboard}
          alwaysPassFilter={alwaysPassFilter}
          onCellValueChanged={(e) => {
            if (e.api.isAnyFilterPresent() && e.node.id) kept.current.add(e.node.id)
          }}
          onFilterChanged={(e) => {
            const s = JSON.stringify(e.api.getFilterModel())
            if (s !== sig.current) {
              sig.current = s
              if (kept.current.size) {
                kept.current.clear()
                e.api.onFilterChanged()
              }
            }
          }}
          onGridReady={onGridReady}
        />
      </div>
    </div>
  )
}
