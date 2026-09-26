/**
 * Clipboard helpers for a lossless grid ⇄ Excel round trip.
 *
 * AG Grid copies with `suppressQuotes: true`, so a cell containing a tab or a
 * newline would silently split into several cells/rows when pasted into Excel
 * (or back into the grid). `quoteTsvField` applies the same quoting Excel uses
 * when *it* copies such a cell, and AG Grid's paste parser understands it.
 */

/** Quote a field the way Excel does when copying: only if it needs it. */
export function quoteTsvField(value: string): string {
  if (/[\t\r\n]/.test(value) || value.startsWith('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * AG Grid (36.2) splits pasted text on unquoted tabs/newlines correctly but
 * leaves the quoting in place: Excel's `"Line A\nLine ""B"""` arrives as that
 * literal text. Its fields are otherwise verbatim, so unquoting them here
 * restores exactly what Excel had in the cell.
 */
export function unquoteTsvField(field: string): string {
  if (field.length >= 2 && field.startsWith('"') && field.endsWith('"')) {
    const inner = field.slice(1, -1)
    // a well-formed quoted field has only doubled quotes inside
    if (!/(^|[^"])"("")*([^"]|$)/.test(inner)) return inner.replace(/""/g, '"')
  }
  return field
}

/**
 * Parse TSV exactly like AG Grid's paste path (quoted fields, "" escapes,
 * CRLF/LF/CR row breaks). Used to rebuild the HTML clipboard flavour.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [[""]]
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const row = rows[rows.length - 1]
    if (ch === '"') {
      if (inQuotes) {
        if (text[i + 1] === '"') {
          row[row.length - 1] += '"'
          i++
        } else {
          inQuotes = false
        }
        continue
      }
      const prev = text[i - 1]
      if (prev === undefined || prev === "\t" || prev === "\n" || prev === "\r") {
        inQuotes = true
        continue
      }
    }
    if (!inQuotes && ch === "\t") {
      row.push("")
      continue
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++
      rows.push([""])
      continue
    }
    row[row.length - 1] += ch
  }
  return rows
}

/**
 * Excel (and Google Sheets) terminate a copied range with a line break. AG
 * Grid turns that into an extra empty row, which (a) pastes a blank into the
 * row below the target and (b) stops a single copied cell from filling a
 * selected range. Strip trailing empty rows before AG Grid sees the data.
 */
export function stripTrailingEmptyRows(data: string[][]): string[][] {
  const out = data.slice()
  while (out.length > 1) {
    const last = out[out.length - 1]
    if (last.length === 1 && last[0] === "") out.pop()
    else break
  }
  return out
}

export type ExcelCellKind = "text" | "number" | "currency" | "date" | "boolean"

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const MSO_FORMAT: Record<ExcelCellKind, string> = {
  // "\@" = Text: keeps leading zeros (SKU 00123) and stops Excel turning
  // strings like 1-2 or 3/4 into dates
  text: "\\@",
  number: "General",
  currency: "\\$\\#\\,\\#\\#0\\.00",
  date: "yyyy\\-mm\\-dd",
  boolean: "General",
}

/**
 * Build the `text/html` clipboard flavour. Excel prefers HTML over plain text
 * when pasting and honours `mso-number-format`, so values land with the right
 * type regardless of the user's regional settings.
 */
export function buildExcelHtml(
  rows: string[][],
  kinds: (ExcelCellKind | "header")[][],
  /** locale-independent value hints: x:num (numbers, date serials) / x:bool */
  hint?: (kind: ExcelCellKind, value: string) => { num?: string; bool?: string } | undefined
): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const kind = kinds[r]?.[c] ?? "text"
          const content = escapeHtml(value).replace(
            /\r\n|\r|\n/g,
            '<br style="mso-data-placement:same-cell;">'
          )
          if (kind === "header") return `<th>${content}</th>`
          const style = `mso-number-format:'${MSO_FORMAT[kind]}';`
          const h = hint?.(kind, value)
          const attrs =
            (h?.num != null ? ` x:num="${escapeHtml(h.num)}"` : "") +
            (h?.bool != null ? ` x:bool="${escapeHtml(h.bool)}"` : "")
          return `<td style="${escapeHtml(style)}"${attrs}>${content}</td>`
        })
        .join("")
      return `<tr>${cells}</tr>`
    })
    .join("")
  return (
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<head><meta charset="utf-8"></head><body>' +
    `<table>${body}</table></body></html>`
  )
}
