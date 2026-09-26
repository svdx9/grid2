import {
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  NumberEditorModule,
  NumberFilterModule,
  RowApiModule,
  TextEditorModule,
  TextFilterModule,
  ValidationModule,
  type ColDef,
  type GridReadyEvent,
} from "ag-grid-community"
import { CellSelectionModule, SetFilterModule } from "ag-grid-enterprise"
import { AgGridReact } from "ag-grid-react"
import { useState } from "react"

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextEditorModule,
  NumberEditorModule,
  TextFilterModule,
  NumberFilterModule,
  SetFilterModule,
  CellSelectionModule,
  // api modules used by the test-suite via window.__gridApi; keep them
  RowApiModule,
  ClientSideRowModelApiModule,
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

const columnDefs: ColDef<Order>[] = [
  { field: "sku", headerName: "SKU", filter: "agTextColumnFilter" },
  { field: "product", filter: "agTextColumnFilter" },
  { field: "region", filter: "agSetColumnFilter" },
  { field: "qty", headerName: "Qty", cellDataType: "number", filter: "agNumberColumnFilter" },
  { field: "notes", flex: 1 },
]

const defaultColDef: ColDef<Order> = { editable: true, floatingFilter: true }

export default function App() {
  const [rowData] = useState(initialRows)

  const onGridReady = (e: GridReadyEvent<Order>) => {
    // used by the test-suite; keep it
    if (import.meta.env.DEV) (window as unknown as { __gridApi: unknown }).__gridApi = e.api
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1 }}>
        <AgGridReact<Order>
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => p.data.id}
          cellSelection
          onGridReady={onGridReady}
        />
      </div>
    </div>
  )
}
