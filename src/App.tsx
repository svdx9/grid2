import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Csv01Icon,
  Delete02Icon,
  FilterRemoveIcon,
  InformationCircleIcon,
  Moon02Icon,
  Redo02Icon,
  RefreshIcon,
  Search01Icon,
  Sun03Icon,
  Undo02Icon,
  Xls01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  DataGrid,
  type DataGridHandle,
  type GridNotice,
  type GridStatus,
} from "@/grid/DataGrid"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? "⌘" : "Ctrl"

function Icon({ icon, className }: { icon: IconSvgElement; className?: string }) {
  return <HugeiconsIcon icon={icon} strokeWidth={2} className={className} />
}

function ToolbarButton({
  tip,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { tip: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("theme")
      if (saved) return saved === "dark"
    } catch {
      /* storage unavailable */
    }
    // a host page (e.g. an embedding viewer) may state the theme explicitly
    const hostTheme = document.documentElement.getAttribute("data-theme")
    if (hostTheme === "dark" || hostTheme === "light") return hostTheme === "dark"
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try {
      localStorage.setItem("theme", dark ? "dark" : "light")
    } catch {
      /* storage unavailable */
    }
  }, [dark])
  return [dark, setDark] as const
}

export default function App() {
  const grid = useRef<DataGridHandle>(null)
  const search = useRef<HTMLInputElement>(null)
  const [dark, setDark] = useDarkMode()
  const [quickFilter, setQuickFilter] = useState("")
  const [keepVisible, setKeepVisible] = useState(true)
  const [status, setStatus] = useState<GridStatus | null>(null)
  const [notice, setNotice] = useState<GridNotice | null>(null)

  // "/" focuses the global search (unless typing somewhere already)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== "/" || t.closest("input, textarea, [contenteditable=true]")) return
      e.preventDefault()
      search.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const showNotice = useCallback((n: Omit<GridNotice, "id">) => setNotice({ ...n, id: Date.now() }), [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        {/* header */}
        <header className="flex items-center gap-3 border-b px-4 py-2.5">
          <div className="flex min-w-0 flex-col">
            <h1 className="text-sm font-semibold">Orders</h1>
            <p className="text-muted-foreground truncate text-xs">
              AG Grid 36.2 (Enterprise) styled with shadcn/ui — Mira
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => setDark(!dark)} aria-label="Toggle theme">
              <Icon icon={dark ? Sun03Icon : Moon02Icon} />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col gap-2 p-3">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64">
                <Icon
                  icon={Search01Icon}
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                />
                <Input
                  ref={search}
                  value={quickFilter}
                  onChange={(e) => setQuickFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuickFilter("")}
                  placeholder="Search all columns…"
                  className="pr-12 pl-7"
                  aria-label="Global filter"
                />
                {quickFilter ? (
                  <button
                    type="button"
                    onClick={() => setQuickFilter("")}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                    aria-label="Clear search"
                  >
                    <Icon icon={Cancel01Icon} className="size-3.5" />
                  </button>
                ) : (
                  <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
                )}
              </div>

              <Separator orientation="vertical" className="mx-1 h-5!" />

              <ToolbarButton tip="Insert a row below the focused cell" onClick={() => grid.current?.addRow()}>
                <Icon icon={Add01Icon} /> Add row
              </ToolbarButton>
              <ToolbarButton
                tip="Delete every row touched by the selected cells"
                onClick={() => grid.current?.deleteRows()}
              >
                <Icon icon={Delete02Icon} /> Delete rows
              </ToolbarButton>
              <ToolbarButton
                tip={
                  <KbdGroup>
                    <Kbd>{MOD}</Kbd>
                    <Kbd>Z</Kbd>
                  </KbdGroup>
                }
                size="icon-sm"
                disabled={!status?.canUndo}
                onClick={() => grid.current?.undo()}
                aria-label="Undo"
              >
                <Icon icon={Undo02Icon} />
              </ToolbarButton>
              <ToolbarButton
                tip={
                  <KbdGroup>
                    <Kbd>{MOD}</Kbd>
                    <Kbd>Y</Kbd>
                  </KbdGroup>
                }
                size="icon-sm"
                disabled={!status?.canRedo}
                onClick={() => grid.current?.redo()}
                aria-label="Redo"
              >
                <Icon icon={Redo02Icon} />
              </ToolbarButton>

              <Separator orientation="vertical" className="mx-1 h-5!" />

              <ToolbarButton
                tip="Remove all column filters"
                disabled={!status?.activeColumnFilters}
                onClick={() => grid.current?.clearFilters()}
              >
                <Icon icon={FilterRemoveIcon} /> Clear filters
                {!!status?.activeColumnFilters && (
                  <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1">
                    {status.activeColumnFilters}
                  </Badge>
                )}
              </ToolbarButton>

              <div className="flex items-center gap-2 pl-1">
                <Switch id="keep-visible" checked={keepVisible} onCheckedChange={setKeepVisible} />
                <Label htmlFor="keep-visible" className="text-xs font-normal">
                  Keep new &amp; edited rows visible while filtered
                </Label>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm">
                      Export <Icon icon={ArrowDown01Icon} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Visible rows (filters applied)</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => grid.current?.exportExcel("filtered")}>
                        <Icon icon={Xls01Icon} /> Excel (.xlsx)
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => grid.current?.exportCsv("filtered")}>
                        <Icon icon={Csv01Icon} /> CSV
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>All rows</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => grid.current?.exportExcel("all")}>
                        <Icon icon={Xls01Icon} /> Excel (.xlsx)
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => grid.current?.exportCsv("all")}>
                        <Icon icon={Csv01Icon} /> CSV
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => grid.current?.resetData()} variant="destructive">
                      <Icon icon={RefreshIcon} /> Reset demo data
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* kept-visible banner */}
            {!!status?.kept && (
              <div
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                style={{ borderColor: "color-mix(in oklch, var(--kept) 45%, transparent)" }}
                data-testid="kept-banner"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--kept)" }} />
                <span>
                  <strong className="font-medium">{status.kept}</strong> row{status.kept === 1 ? " is" : "s are"}{" "}
                  shown outside the current filter because {status.kept === 1 ? "it was" : "they were"} added or
                  edited while filtering.
                </span>
                <Button variant="outline" size="xs" className="ml-auto" onClick={() => grid.current?.reapplyFilters()}>
                  Re-apply filter
                </Button>
              </div>
            )}

            {/* grid */}
            <div className="min-h-0 flex-1">
              <DataGrid
                ref={grid}
                quickFilterText={quickFilter}
                keepRowsVisible={keepVisible}
                onStatusChange={setStatus}
                onNotice={showNotice}
              />
            </div>

            {/* status bar */}
            <footer className="text-muted-foreground flex h-6 items-center gap-3 text-xs">
              <span data-testid="row-count" className="tabular-nums">
                {status
                  ? status.filtering
                    ? `${status.displayed.toLocaleString()} of ${status.total.toLocaleString()} rows`
                    : `${status.total.toLocaleString()} rows`
                  : "Loading…"}
              </span>
              {notice && (
                <span
                  key={notice.id}
                  data-testid="notice"
                  className={cn(
                    "animate-in fade-in flex items-center gap-1.5 truncate",
                    notice.tone === "warning" ? "text-destructive" : "text-foreground"
                  )}
                >
                  <Icon
                    icon={notice.tone === "warning" ? Alert02Icon : InformationCircleIcon}
                    className="size-3.5 shrink-0"
                  />
                  {notice.text}
                </span>
              )}
              <span className="ml-auto hidden items-center gap-1 md:flex">
                Right-click for more · <Kbd>F2</Kbd> edit · <Kbd>Delete</Kbd> clear
              </span>
            </footer>
          </main>

          <HowToPanel />
        </div>
      </div>
    </TooltipProvider>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="space-y-1">
      <p className="text-foreground font-medium">{title}</p>
      <div className="text-muted-foreground space-y-1 leading-relaxed">{children}</div>
    </li>
  )
}

function HowToPanel() {
  return (
    <aside className="bg-muted/30 hidden w-80 shrink-0 overflow-y-auto border-l p-4 text-xs xl:block">
      <h2 className="mb-3 text-sm font-semibold">Try it</h2>
      <ol className="space-y-4">
        <Step title="Cell editing">
          <p>
            Type, double-click or press <Kbd>F2</Kbd>. <Kbd>Enter</Kbd> moves down like Excel. Region is a searchable
            select, Notes opens a multi-line editor, Shipped toggles with <Kbd>Space</Kbd>.
          </p>
          <p>
            Invalid input (e.g. “abc” in Qty) keeps the old value and tells you why instead of writing blank/NaN.
          </p>
        </Step>
        <Step title="Copy / paste cell ranges">
          <p>
            Drag or <Kbd>Shift</Kbd>+arrows to select, then{" "}
            <KbdGroup>
              <Kbd>{MOD}</Kbd>
              <Kbd>C</Kbd>
            </KbdGroup>{" "}
            /{" "}
            <KbdGroup>
              <Kbd>{MOD}</Kbd>
              <Kbd>V</Kbd>
            </KbdGroup>
            . A single copied value fills the whole selected range. Drag the fill handle, or{" "}
            <KbdGroup>
              <Kbd>{MOD}</Kbd>
              <Kbd>D</Kbd>
            </KbdGroup>{" "}
            to fill down. Everything is undoable.
          </p>
          <p>
            Click a row number, or drag down the row numbers, to select whole rows — then copy, paste over them or
            use <em>Delete rows</em>.
          </p>
          <p>
            Like a spreadsheet, empty rows continue below the data (also when filtered) and more appear as you scroll,
            up to 1,000. Type or paste into one and it becomes a real row.
          </p>
        </Step>
        <Step title="Round trip with Excel">
          <p>
            Copy a range into Excel: numbers, currency and dates arrive as real typed values, SKUs keep leading zeros,
            multi-line notes stay in one cell.
          </p>
          <p>
            Copy from Excel back in: “$1,234.50”, “(12)”, “26/09/2026”, “Sep 26, 2026”, TRUE/FALSE are all parsed.
            Paste past the last row and the extra rows are appended.
          </p>
        </Step>
        <Step title="Export">
          <p>
            <strong className="text-foreground font-medium">.xlsx</strong> keeps types (numbers, dates, booleans,
            text SKUs), frozen header and pinned column.{" "}
            <strong className="text-foreground font-medium">CSV</strong> is UTF-8 with BOM, ISO dates, raw numbers,
            and formula-injection protection.
          </p>
        </Step>
        <Step title="Column filters + global filter">
          <p>
            Excel (Mac)–style filters on every column: a searchable value list that filters as you type, with
            Text/Number/Date conditions in a submenu. Floating filters sit under each header. The search box filters across every
            column, including formatted values (“$49.00”, “Sept 2025”).
          </p>
        </Step>
        <Step title="Filters bound to the existing rows">
          <p>
            Set a filter (e.g. Region = North), then <em>Add row</em>, edit a row so it no longer matches, or paste
            new rows. They stay visible (orange stripe) instead of vanishing mid-task.
          </p>
          <p>
            Changing the filter, or <em>Re-apply filter</em>, evaluates it again over all rows. Turn the switch off to
            see AG Grid's default behaviour.
          </p>
        </Step>
      </ol>
    </aside>
  )
}
