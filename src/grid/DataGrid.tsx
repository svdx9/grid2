import {
  CellApiModule,
  CellStyleModule,
  CheckboxEditorModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  CsvExportModule,
  DateEditorModule,
  DateFilterModule,
  EventApiModule,
  LargeTextEditorModule,
  ModuleRegistry,
  NumberEditorModule,
  NumberFilterModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  RowStyleModule,
  ScrollApiModule,
  TextEditorModule,
  TextFilterModule,
  TooltipModule,
  UndoRedoEditModule,
  ValidationModule,
  type CellSelectionOptions,
  type CellValueChangedEvent,
  type CsvExportParams,
  type ExcelExportParams,
  type GetContextMenuItemsParams,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
  type IRowNode,
  type DefaultMenuItem,
  type MenuItemDef,
  type PostSortRowsParams,
  type ProcessDataFromClipboardParams,
  type ShouldRowBeSkippedParams,
  type BodyScrollEvent,
  type RowClassRules,
  type RowNumbersOptions,
} from "ag-grid-community"
import {
  CellSelectionModule,
  ClipboardModule,
  ColumnMenuModule,
  ContextMenuModule,
  ExcelExportModule,
  LicenseManager,
  MultiFilterModule,
  RichSelectModule,
  RowNumbersModule,
  SetFilterModule,
} from "ag-grid-enterprise"
import { AgGridReact } from "ag-grid-react"
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react"

import { stripTrailingEmptyRows, unquoteTsvField } from "./clipboard"
import { columnDefs, defaultColDef, parseForColumn, type GridContext } from "./columns"
import { emptyOrder, generateOrders, type Order } from "./data"
import {
  EMPTY_ROW_PREFIX,
  EMPTY_ROWS_INITIAL,
  emptyRowsToAdd,
  isBlankOrder,
  makeEmptyRows,
  moveEmptyRowsLast,
} from "./emptyRows"
import {
  excelStyles,
  sendToClipboard,
  processCellForClipboard,
  processCellForCsv,
  processCellForExcel,
} from "./io"
import { computeRowNumbers } from "./rowNumbering"
import { shadcnMiraTheme } from "./theme"

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  ColumnApiModule,
  CellApiModule,
  RowApiModule,
  ScrollApiModule,
  RenderApiModule,
  EventApiModule,
  CellStyleModule,
  RowStyleModule,
  TooltipModule,
  // editing
  TextEditorModule,
  NumberEditorModule,
  DateEditorModule,
  CheckboxEditorModule,
  LargeTextEditorModule,
  RichSelectModule,
  UndoRedoEditModule,
  // Sheets-style row header: click or drag down it to select whole rows
  RowNumbersModule,
  // filtering
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  SetFilterModule,
  MultiFilterModule,
  QuickFilterModule,
  // selection, clipboard, export
  CellSelectionModule,
  ClipboardModule,
  CsvExportModule,
  ExcelExportModule,
  ColumnMenuModule,
  ContextMenuModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])

const licenseKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY as string | undefined
if (licenseKey) LicenseManager.setLicenseKey(licenseKey)

export interface GridStatus {
  displayed: number
  total: number
  /** rows currently shown only because they were added/edited while filtered */
  kept: number
  filtering: boolean
  activeColumnFilters: number
  canUndo: boolean
  canRedo: boolean
}

export interface GridNotice {
  id: number
  tone: "info" | "warning"
  text: string
}

export interface DataGridHandle {
  addRow: () => void
  deleteRows: () => void
  undo: () => void
  redo: () => void
  clearFilters: () => void
  reapplyFilters: () => void
  exportCsv: (scope: "filtered" | "all") => void
  exportExcel: (scope: "filtered" | "all") => void
  resetData: () => void
}

interface DataGridProps {
  ref?: Ref<DataGridHandle>
  quickFilterText: string
  keepRowsVisible: boolean
  onStatusChange: (status: GridStatus) => void
  onNotice: (notice: Omit<GridNotice, "id">) => void
}

interface PendingOverflow {
  rows: string[][]
  startColId: string
}

const EXPORT_NAME = () => `orders-${new Date().toISOString().slice(0, 10)}`

const getRowId = ({ data }: GetRowIdParams<Order>) => data.id

/** exports contain data rows only, never the empty rows below them */
const skipEmptyRows = ({ node, context }: ShouldRowBeSkippedParams<Order>) =>
  (context as GridContext).isEmptyRow(node.id)
const defaultCsvExportParams: CsvExportParams = {
  processCellCallback: processCellForCsv,
  shouldRowBeSkipped: skipEmptyRows,
}
const defaultExcelExportParams: ExcelExportParams = {
  processCellCallback: processCellForExcel,
  shouldRowBeSkipped: skipEmptyRows,
  sheetName: "Orders",
}

/**
 * Data rows plus the initial block of empty rows, and the set of empty ids.
 * Pure: React may call a state initialiser twice (StrictMode), so the id set
 * must come from the same call as the rows.
 */
function initialRows(): { rows: Order[]; emptyIds: Set<string> } {
  const empty = makeEmptyRows(EMPTY_ROWS_INITIAL)
  return { rows: [...generateOrders(), ...empty], emptyIds: new Set(empty.map((r) => r.id)) }
}
const cellSelection: CellSelectionOptions<Order> = { handle: { mode: "fill" }, enableHeaderHighlight: true }
// AG Grid re-measures this column on full refreshes only, not on transactions
// (which is how empty rows arrive), so give it room for 5 digits up front.
// Numbers stay with their rows when filtering, like Sheets (rowNumbering.ts).
const rowNumbers: RowNumbersOptions = {
  width: 64,
  minWidth: 64,
  valueGetter: ({ node, context }) =>
    (context as GridContext).rowNumberOf(node?.id) ?? (node?.rowIndex != null ? node.rowIndex + 1 : null),
}

export const DataGrid = memo(function DataGrid({
  ref,
  quickFilterText,
  keepRowsVisible,
  onStatusChange,
  onNotice,
}: DataGridProps) {
  // ── Sheets-style empty rows below the data (see emptyRows.ts)
  const [initial] = useState(initialRows)
  const emptyIds = useRef(initial.emptyIds)
  const [rowData, setRowData] = useState<Order[]>(initial.rows)
  const apiRef = useRef<GridApi<Order> | null>(null)
  const isEmptyRow = useCallback((id: string | undefined) => !!id && emptyIds.current.has(id), [])

  // ── Sheets-style row numbers: fixed per row regardless of filters
  const rowNumberById = useRef(new Map<string, number>())
  const rowNumberOf = useCallback((id: string | undefined) => (id ? rowNumberById.current.get(id) : undefined), [])

  // ── "bound" filters: rows added/edited while a filter is active stay visible
  const keptIds = useRef(new Set<string>())
  const keepRef = useRef(keepRowsVisible)
  const filterSignature = useRef("")

  // ── paste bookkeeping
  const pendingOverflow = useRef<PendingOverflow | null>(null)
  const invalidDuringPaste = useRef(0)
  const pasting = useRef(false)

  const noticeRef = useRef(onNotice)
  const statusRef = useRef(onStatusChange)
  useEffect(() => {
    noticeRef.current = onNotice
    statusRef.current = onStatusChange
  }, [onNotice, onStatusChange])

  const publishStatus = useCallback(() => {
    const api = apiRef.current
    if (!api || api.isDestroyed()) return
    let total = 0
    api.forEachNode(() => total++)
    const filtering = api.isAnyFilterPresent()
    // empty rows always pass filters, so they're all displayed; count data rows only
    const empty = emptyIds.current.size
    statusRef.current({
      displayed: api.getDisplayedRowCount() - empty,
      total: total - empty,
      kept: filtering ? keptIds.current.size : 0,
      filtering,
      activeColumnFilters: Object.keys(api.getFilterModel() ?? {}).length,
      canUndo: api.getCurrentUndoSize() > 0,
      canRedo: api.getCurrentRedoSize() > 0,
    })
  }, [])

  const currentSignature = (api: GridApi<Order>) =>
    JSON.stringify(api.getFilterModel() ?? {}) + "\u0000" + (api.getGridOption("quickFilterText") ?? "")

  /** Mark rows as kept-visible (only meaningful while a filter is active). */
  const keepRows = useCallback((nodes: IRowNode<Order>[]) => {
    const api = apiRef.current
    if (!api || !keepRef.current || !api.isAnyFilterPresent()) return
    const fresh = nodes.filter((n) => n.id && !keptIds.current.has(n.id) && !isEmptyRow(n.id))
    if (!fresh.length) return
    for (const n of fresh) keptIds.current.add(n.id!)
    // re-evaluate rowClassRules for the marker stripe
    api.redrawRows({ rowNodes: fresh })
  }, [isEmptyRow])

  const clearKept = useCallback((refilter: boolean) => {
    const api = apiRef.current
    if (!keptIds.current.size) return
    keptIds.current.clear()
    if (refilter && api) api.onFilterChanged()
  }, [])

  // keep prop → ref in sync; switching the feature off re-applies filters
  useEffect(() => {
    if (keepRef.current === keepRowsVisible) return
    keepRef.current = keepRowsVisible
    if (!keepRowsVisible) clearKept(true)
  }, [keepRowsVisible, clearKept])

  const alwaysPassFilter = useCallback(
    (node: IRowNode<Order>) =>
      isEmptyRow(node.id) || (keepRef.current && !!node.id && keptIds.current.has(node.id)),
    [isEmptyRow]
  )

  const postSortRows = useCallback(
    ({ nodes }: PostSortRowsParams<Order>) => moveEmptyRowsLast(nodes, (n) => isEmptyRow(n.id)),
    [isEmptyRow]
  )

  const rowClassRules = useMemo<RowClassRules<Order>>(
    () => ({
      "row-kept-visible": (p) =>
        keepRef.current && !!p.node.id && keptIds.current.has(p.node.id) && p.api.isAnyFilterPresent(),
      "row-empty": (p) => isEmptyRow(p.node.id),
    }),
    [isEmptyRow]
  )

  const context = useMemo<GridContext>(
    () => ({
      onInvalidValue: (colId, raw) => {
        if (pasting.current) {
          invalidDuringPaste.current++
          return
        }
        noticeRef.current({
          tone: "warning",
          text: `“${String(raw)}” isn't a valid ${colId} value — kept the previous value.`,
        })
      },
      isEmptyRow,
      rowNumberOf,
    }),
    [isEmptyRow, rowNumberOf]
  )

  // ───────────────────────────── row operations ─────────────────────────────

  const addRow = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    api.stopEditing()
    const row = emptyOrder()
    const focused = api.getFocusedCell()
    const anchor = focused ? api.getDisplayedRowAtIndex(focused.rowIndex) : undefined
    const addIndex = anchor?.sourceRowIndex != null ? anchor.sourceRowIndex + 1 : 0
    // mark before the transaction so the row survives the filter pass it triggers
    if (keepRef.current && api.isAnyFilterPresent()) keptIds.current.add(row.id)
    const result = api.applyTransaction({ add: [row], addIndex })
    const node = result?.add[0]
    if (node?.rowIndex == null) return
    api.ensureNodeVisible(node)
    api.setFocusedCell(node.rowIndex, "sku")
    api.startEditingCell({ rowIndex: node.rowIndex, colKey: "sku" })
    // Started from a toolbar button the grid doesn't own browser focus, and the
    // editor opens unfocused — typing would go nowhere. Hand focus to it.
    requestAnimationFrame(() => {
      const [editor] = api.getCellEditorInstances({ rowNodes: [node], columns: ["sku"] })
      const input = (editor as { getGui?: () => HTMLElement } | undefined)
        ?.getGui?.()
        ?.querySelector<HTMLElement>("input, textarea")
      if (input && document.activeElement !== input) input.focus()
    })
  }, [])

  const rowsInSelection = useCallback((api: GridApi<Order>) => {
    const nodes = new Set<IRowNode<Order>>()
    for (const range of api.getCellRanges() ?? []) {
      if (!range.startRow || !range.endRow) continue
      const from = Math.min(range.startRow.rowIndex, range.endRow.rowIndex)
      const to = Math.max(range.startRow.rowIndex, range.endRow.rowIndex)
      for (let i = from; i <= to; i++) {
        const node = api.getDisplayedRowAtIndex(i)
        if (node?.data && !isEmptyRow(node.id)) nodes.add(node)
      }
    }
    if (!nodes.size) {
      const focused = api.getFocusedCell()
      const node = focused ? api.getDisplayedRowAtIndex(focused.rowIndex) : undefined
      if (node?.data && !isEmptyRow(node.id)) nodes.add(node)
    }
    return [...nodes]
  }, [isEmptyRow])

  const deleteRows = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    api.stopEditing(true)
    const nodes = rowsInSelection(api)
    if (!nodes.length) {
      noticeRef.current({ tone: "info", text: "Select cells in the rows you want to delete." })
      return
    }
    const focusedRow = Math.min(...nodes.map((n) => n.rowIndex ?? 0))
    for (const n of nodes) keptIds.current.delete(n.id!)
    api.applyTransaction({ remove: nodes.map((n) => n.data!) })
    api.clearCellSelection()
    const count = api.getDisplayedRowCount()
    if (count) api.setFocusedCell(Math.min(focusedRow, count - 1), "sku")
    noticeRef.current({ tone: "info", text: `Deleted ${nodes.length} row${nodes.length === 1 ? "" : "s"}.` })
  }, [rowsInSelection])

  // ───────────────────────────── paste ─────────────────────────────

  /**
   * - unquotes Excel-quoted cells (multi-line text, embedded quotes)
   * - strips Excel's trailing line break (otherwise single-cell paste doesn't
   *   fill a range and a blank lands in the next row)
   * - pastes that run past the last row are split off and appended as new rows
   */
  const processDataFromClipboard = useCallback(
    (params: ProcessDataFromClipboardParams<Order>): string[][] | null => {
      const { api } = params
      const data = stripTrailingEmptyRows(params.data.map((row) => row.map(unquoteTsvField)))
      pendingOverflow.current = null
      if (data.length === 1 && data[0].length === 1) return data

      const displayedCols = api.getAllDisplayedColumns()
      const ranges = api.getCellRanges() ?? []
      const focused = api.getFocusedCell()
      const range = ranges[0]
      const rangeIsMultiCell =
        !!range?.startRow &&
        !!range.endRow &&
        (ranges.length > 1 || range.columns.length > 1 || range.startRow.rowIndex !== range.endRow.rowIndex)

      let startRow: number
      let startColId: string
      if (rangeIsMultiCell && range.startRow && range.endRow) {
        const rangeRows = Math.abs(range.endRow.rowIndex - range.startRow.rowIndex) + 1
        // a range that's an exact multiple of the clipboard is tiled, never extended
        if (rangeRows >= data.length && rangeRows % data.length === 0) return data
        startRow = Math.min(range.startRow.rowIndex, range.endRow.rowIndex)
        const first = [...range.columns].sort(
          (a, b) => displayedCols.indexOf(a) - displayedCols.indexOf(b)
        )[0]
        startColId = first.getColId()
      } else if (focused && !focused.rowPinned) {
        startRow = focused.rowIndex
        startColId = focused.column.getColId()
      } else {
        return data
      }

      const available = api.getDisplayedRowCount() - startRow
      if (data.length <= available) return data
      pendingOverflow.current = { rows: data.slice(available), startColId }
      return available > 0 ? data.slice(0, available) : null
    },
    []
  )

  const appendOverflowRows = useCallback((api: GridApi<Order>, overflow: PendingOverflow) => {
    const displayedCols = api.getAllDisplayedColumns()
    const start = displayedCols.findIndex((c) => c.getColId() === overflow.startColId)
    let invalid = 0
    const rows = overflow.rows.map((values) => {
      const row = emptyOrder()
      values.forEach((raw, i) => {
        const column = displayedCols[start + i]
        const colDef = column?.getColDef()
        if (!column || !colDef?.field || colDef.editable === false) return
        const parsed = parseForColumn(column.getColId(), raw)
        if (parsed.ok) (row as unknown as Record<string, unknown>)[colDef.field] = parsed.value
        else invalid++
      })
      return row
    })
    if (keepRef.current && api.isAnyFilterPresent()) for (const r of rows) keptIds.current.add(r.id)
    const result = api.applyTransaction({ add: rows })
    if (result?.add.length) api.flashCells({ rowNodes: result.add })
    return { added: rows.length, invalid }
  }, [])

  // ───────────────────────────── grid events ─────────────────────────────

  const onGridReady = useCallback(
    (e: GridReadyEvent<Order>) => {
      apiRef.current = e.api
      // exposed for the Playwright suite (dev builds only)
      if (import.meta.env.DEV) (window as unknown as { __gridApi: unknown }).__gridApi = e.api
      filterSignature.current = currentSignature(e.api)
      rowNumberById.current = computeRowNumbers(e.api, isEmptyRow)
      e.api.refreshCells({ columns: ["ag-Grid-RowNumbersColumn"] })
      publishStatus()
    },
    [publishStatus, isEmptyRow]
  )

  const onFilterChanged = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const sig = currentSignature(api)
    if (sig !== filterSignature.current) {
      // the user changed the filter criteria: it's a new query over *all* rows
      filterSignature.current = sig
      clearKept(true)
    }
    publishStatus()
  }, [clearKept, publishStatus])

  // rows whose empty/data status changed and need their row classes refreshed;
  // flushed after the edit, or once at the end of a paste
  const pendingRedraw = useRef(new Set<IRowNode<Order>>())
  const flushRedraw = useCallback(() => {
    const api = apiRef.current
    if (!api || !pendingRedraw.current.size) return
    api.redrawRows({ rowNodes: [...pendingRedraw.current] })
    pendingRedraw.current.clear()
  }, [])

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<Order>) => {
      const { node } = e
      const id = node.id
      if (id && node.data) {
        if (emptyIds.current.has(id) && !isBlankOrder(node.data)) {
          // typing or pasting into an empty row makes it a data row
          emptyIds.current.delete(id)
          pendingRedraw.current.add(node)
        } else if (id.startsWith(EMPTY_ROW_PREFIX) && !emptyIds.current.has(id) && isBlankOrder(node.data)) {
          // a row that started out empty and has been cleared again (e.g. undo)
          emptyIds.current.add(id)
          keptIds.current.delete(id)
          pendingRedraw.current.add(node)
        }
      }
      keepRows([node])
      if (!pasting.current) {
        flushRedraw()
        publishStatus()
      }
    },
    [keepRows, publishStatus, flushRedraw]
  )

  /** Append a batch of empty rows. Batched because adding rows clears undo history. */
  const addEmptyRows = useCallback((api: GridApi<Order>, count: number) => {
    if (count <= 0) return
    const rows = makeEmptyRows(count)
    for (const r of rows) emptyIds.current.add(r.id)
    api.applyTransaction({ add: rows })
  }, [])

  /** Keep rows coming as the user scrolls towards the end (up to the cap). */
  const growIfNearEnd = useCallback(
    (api: GridApi<Order>) => {
      const count = api.getDisplayedRowCount()
      const last = count ? api.getDisplayedRowAtIndex(count - 1) : undefined
      if (!last || last.rowTop == null || !last.rowHeight) return
      const add = emptyRowsToAdd({
        viewportBottom: api.getVerticalPixelRange().bottom,
        contentBottom: last.rowTop + last.rowHeight,
        rowHeight: last.rowHeight,
        current: emptyIds.current.size,
      })
      addEmptyRows(api, add)
    },
    [addEmptyRows]
  )

  const onBodyScroll = useCallback(
    (e: BodyScrollEvent<Order>) => {
      if (e.direction === "vertical") growIfNearEnd(e.api)
    },
    [growIfNearEnd]
  )

  /** A tall screen (or a short filtered list) must still be filled to the bottom. */
  const onFirstDataRendered = useCallback(() => {
    const api = apiRef.current
    if (api) growIfNearEnd(api)
  }, [growIfNearEnd])

  const onPasteStart = useCallback(() => {
    pasting.current = true
    invalidDuringPaste.current = 0
  }, [])

  const onPasteEnd = useCallback(() => {
    const api = apiRef.current
    pasting.current = false
    if (!api) return
    flushRedraw()
    let added = 0
    let invalid = invalidDuringPaste.current
    const overflow = pendingOverflow.current
    pendingOverflow.current = null
    if (overflow) {
      const r = appendOverflowRows(api, overflow)
      added = r.added
      invalid += r.invalid
    }
    const parts: string[] = []
    if (added) parts.push(`added ${added} new row${added === 1 ? "" : "s"} for the overflow`)
    if (invalid) parts.push(`${invalid} value${invalid === 1 ? "" : "s"} couldn't be parsed and ${invalid === 1 ? "was" : "were"} skipped`)
    if (parts.length) {
      noticeRef.current({ tone: invalid ? "warning" : "info", text: `Pasted — ${parts.join("; ")}.` })
    }
    publishStatus()
  }, [appendOverflowRows, publishStatus, flushRedraw])

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams<Order>): (DefaultMenuItem | MenuItemDef<Order>)[] => [
      "copy",
      "copyWithHeaders",
      "cut",
      "paste",
      "separator",
      { name: "Insert row below", action: () => addRow() },
      {
        name: "Delete row(s)",
        action: () => deleteRows(),
        disabled: !params.node,
      },
      "separator",
      "csvExport",
      "excelExport",
    ],
    [addRow, deleteRows]
  )

  /** Rows were added/removed/sorted/filtered: renumber, then refresh the status bar.
   *  (AG Grid refreshes the row-number cells itself shortly after this event.) */
  const onModelUpdated = useCallback(() => {
    const api = apiRef.current
    if (!api || api.isDestroyed()) return
    rowNumberById.current = computeRowNumbers(api, isEmptyRow)
    publishStatus()
  }, [isEmptyRow, publishStatus])

  // ───────────────────────────── imperative API ─────────────────────────────

  useImperativeHandle(
    ref,
    () => ({
      addRow,
      deleteRows,
      undo: () => apiRef.current?.undoCellEditing(),
      redo: () => apiRef.current?.redoCellEditing(),
      clearFilters: () => {
        const api = apiRef.current
        if (!api) return
        api.setFilterModel(null)
      },
      reapplyFilters: () => clearKept(true),
      exportCsv: (scope) => {
        const api = apiRef.current
        if (!api) return
        api.stopEditing()
        api.exportDataAsCsv({
          fileName: `${EXPORT_NAME()}.csv`,
          exportedRows: scope === "all" ? "all" : "filteredAndSorted",
          processCellCallback: processCellForCsv,
          shouldRowBeSkipped: skipEmptyRows,
        })
      },
      exportExcel: (scope) => {
        const api = apiRef.current
        if (!api) return
        api.stopEditing()
        api.exportDataAsExcel({
          fileName: `${EXPORT_NAME()}.xlsx`,
          sheetName: "Orders",
          exportedRows: scope === "all" ? "all" : "filteredAndSorted",
          processCellCallback: processCellForExcel,
          shouldRowBeSkipped: skipEmptyRows,
          freezeRows: "headers",
          freezeColumns: "pinned",
        })
      },
      resetData: () => {
        keptIds.current.clear()
        const next = initialRows()
        emptyIds.current = next.emptyIds
        setRowData(next.rows)
      },
    }),
    [addRow, deleteRows, clearKept]
  )

  return (
    <AgGridReact<Order>
      theme={shadcnMiraTheme}
      rowData={rowData}
      columnDefs={columnDefs}
      defaultColDef={defaultColDef}
      getRowId={getRowId}
      context={context}
      // editing
      undoRedoCellEditing
      undoRedoCellEditingLimit={100}
      stopEditingWhenCellsLoseFocus
      enterNavigatesVerticallyAfterEdit
      enterNavigatesVertically
      // selection + clipboard
      cellSelection={cellSelection}
      rowNumbers={rowNumbers}
      processCellForClipboard={processCellForClipboard}
      processDataFromClipboard={processDataFromClipboard}
      sendToClipboard={sendToClipboard}
      // filtering
      quickFilterText={quickFilterText}
      alwaysPassFilter={alwaysPassFilter}
      rowClassRules={rowClassRules}
      // Sheets-style empty rows: always last, and more appear as you scroll
      postSortRows={postSortRows}
      onBodyScroll={onBodyScroll}
      onFirstDataRendered={onFirstDataRendered}
      // export
      excelStyles={excelStyles}
      defaultCsvExportParams={defaultCsvExportParams}
      defaultExcelExportParams={defaultExcelExportParams}
      getContextMenuItems={getContextMenuItems}
      tooltipShowDelay={400}
      // events
      onGridReady={onGridReady}
      onFilterChanged={onFilterChanged}
      onCellValueChanged={onCellValueChanged}
      onPasteStart={onPasteStart}
      onPasteEnd={onPasteEnd}
      onModelUpdated={onModelUpdated}
      onRedoEnded={publishStatus}
      onUndoEnded={publishStatus}
    />
  )
})
