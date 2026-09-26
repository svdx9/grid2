/**
 * Locale-aware parsing/formatting used by editing, clipboard and export.
 *
 * Everything that crosses the grid boundary (paste from Excel, typed edits,
 * fill handle) goes through these parsers, so they are deliberately lenient
 * about *format* but strict about *meaning*: a value that can't be read with
 * confidence returns `undefined` ("invalid") rather than a guess.
 */

/**
 * The user's locale, validated: some environments report tags `Intl` rejects
 * (e.g. `en-US@posix`), which would otherwise throw at startup.
 */
export const LOCALE = resolveLocale(
  typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []
)

export function resolveLocale(candidates: readonly string[]): string {
  for (const tag of candidates) {
    if (!tag) continue
    const cleaned = tag.replace(/[@.].*$/, "").replace(/_/g, "-")
    try {
      const [canonical] = Intl.getCanonicalLocales(cleaned)
      if (canonical) return canonical
    } catch {
      /* try the next one */
    }
  }
  return new Intl.NumberFormat().resolvedOptions().locale || "en-US"
}

function localeDecimalSeparator(locale: string): string {
  const part = new Intl.NumberFormat(locale)
    .formatToParts(1.5)
    .find((p) => p.type === "decimal")
  return part?.value ?? "."
}

/** true when the locale writes dates month-first (e.g. en-US: 9/26/2026) */
function localeIsMonthFirst(locale: string): boolean {
  const parts = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(2026, 8, 26))
  const order = parts
    .filter((p) => p.type === "month" || p.type === "day")
    .map((p) => p.type)
  return order[0] === "month"
}

// ───────────────────────────── numbers ─────────────────────────────

/**
 * Parse a number the way a person (or Excel) would have written it.
 * Handles: `1234.5`, `1,234.50`, `$1,234.50`, `€ 1.234,50` (in comma-decimal
 * locales), `(1,234.50)` accounting negatives, trailing minus, `12%`,
 * scientific `1.2E+05`, non-breaking-space / thin-space grouping.
 *
 * Returns `null` for blank input and `undefined` for unparseable input.
 */
export function parseNumber(
  input: unknown,
  locale: string = LOCALE
): number | null | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined
  if (input == null) return null
  let s = String(input).trim()
  if (s === "") return null

  // Excel scientific notation (General format for very large/small numbers)
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) return Number(s)

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/−/g, "-") // unicode minus
  // a sign is only allowed before the first digit (-$5, $-5) or trailing (5-)
  if (/\d[^\d]*[-+][^\d]*\d/.test(s)) return undefined
  if (/^[^\d]*-/.test(s) || /-\s*$/.test(s)) negative = true
  const percent = s.includes("%")

  // keep digits and separators only (drops currency symbols, spaces, NBSP, ')
  const core = s.replace(/[^\d.,]/g, "")
  if (!/\d/.test(core)) return undefined
  // anything left besides currency/whitespace/sign/percent means it's not a number
  const leftovers = s
    .replace(/[\d.,\s\u00a0\u202f'%+-]/g, "")
    .replace(/\p{Sc}/gu, "")
    .replace(/^(USD|EUR|GBP|CHF|JPY|AUD|CAD)/i, "")
  if (leftovers.length > 0) return undefined

  const dec = decideDecimalSeparator(core, localeDecimalSeparator(locale))
  const [intPart, ...rest] = dec === null ? [core] : core.split(dec)
  if (rest.length > 1) return undefined // two decimal separators
  const fraction = rest[0] ?? ""
  if (/[.,]/.test(fraction)) return undefined // grouping after the decimal point
  // thousands groups must be 3 digits wide: 1,234,567 ok — 1,2,3 is not a number
  const groups = intPart.split(/[.,]/)
  if (groups.length > 1 && groups.slice(1).some((g) => g.length !== 3)) return undefined
  const normalized = groups.join("") + (dec === null ? "" : "." + fraction)
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === ".") return undefined
  let n = Number(normalized)
  if (!Number.isFinite(n)) return undefined
  if (percent) n = n / 100
  if (negative) n = -n
  // squash float noise from the /100 (0.07 * 100 etc.)
  return Number.parseFloat(n.toPrecision(15))
}

/** Decide which of `.`/`,` is the decimal separator, or null if the number is an integer. */
function decideDecimalSeparator(core: string, localeDec: string): "." | "," | null {
  const hasDot = core.includes(".")
  const hasComma = core.includes(",")
  if (hasDot && hasComma) {
    // whichever comes last is the decimal separator: 1,234.50 / 1.234,50
    return core.lastIndexOf(".") > core.lastIndexOf(",") ? "." : ","
  }
  if (!hasDot && !hasComma) return null
  const sep = hasDot ? "." : ","
  const occurrences = core.split(sep).length - 1
  if (occurrences > 1) return null // 1,234,567 → grouping
  const after = core.slice(core.indexOf(sep) + 1)
  if (sep === localeDec) return sep
  // a foreign separator followed by exactly three digits is a thousands group
  // (1,500 in a comma-decimal locale is still ambiguous; favour grouping as Excel does)
  return after.length === 3 ? null : (sep as "." | ",")
}

// ───────────────────────────── dates ─────────────────────────────

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
]

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0")
}

function toIso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return undefined
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return undefined // e.g. 31 Feb
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`
}

/** Excel's two-digit-year rule: 00–29 → 2000s, 30–99 → 1900s */
function expandYear(y: string): number {
  const n = Number(y)
  if (y.length > 2) return n
  return n < 30 ? 2000 + n : 1900 + n
}

function monthFromName(name: string): number | undefined {
  const idx = MONTHS.indexOf(name.slice(0, 3).toLowerCase())
  return idx === -1 ? undefined : idx + 1
}

/** Excel serial date (1900 system) → ISO. 45000 ≈ 2023-03-15. */
export function excelSerialToIso(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return undefined
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * Parse a date into `YYYY-MM-DD`.
 * Accepts ISO (`2026-09-26`, `2026-09-26T10:00:00`), numeric dates in either
 * order (`26/09/2026`, `9/26/2026`, `26.09.26` — ambiguous ones resolved with
 * the browser locale), month names (`26-Sep-2026`, `Sep 26, 2026`), and
 * Excel serial numbers (`46291`).
 *
 * Returns `null` for blank input and `undefined` for unparseable input.
 */
export function parseDate(
  input: unknown,
  locale: string = LOCALE
): string | null | undefined {
  if (input == null) return null
  if (input instanceof Date) {
    return Number.isNaN(input.getTime())
      ? undefined
      : toIso(input.getFullYear(), input.getMonth() + 1, input.getDate())
  }
  const s = String(input).trim()
  if (s === "") return null

  let m: RegExpMatchArray | null

  // ISO / year-first: 2026-09-26, 2026/9/26, 2026-09-26T00:00:00(.000Z)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/))) {
    return toIso(+m[1], +m[2], +m[3])
  }

  // Excel serial number (only a bare 5-digit number is treated as a serial)
  if ((m = s.match(/^(\d{5})(\.\d+)?$/))) {
    return excelSerialToIso(Number(s))
  }

  // numeric: a/b/yyyy — day/month order from values, else from locale
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/))) {
    const a = +m[1]
    const b = +m[2]
    const y = expandYear(m[3])
    if (a > 12 && b <= 12) return toIso(y, b, a)
    if (b > 12 && a <= 12) return toIso(y, a, b)
    return localeIsMonthFirst(locale) ? toIso(y, a, b) : toIso(y, b, a)
  }

  // 26-Sep-2026, 26 Sep 2026, 26 September 26
  if ((m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3,9})\.?[-\s/.,]+(\d{2}|\d{4})$/))) {
    const month = monthFromName(m[2])
    return month ? toIso(expandYear(m[3]), month, +m[1]) : undefined
  }

  // Sep 26, 2026 / September 26 2026
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})$/))) {
    const month = monthFromName(m[1])
    return month ? toIso(expandYear(m[3]), month, +m[2]) : undefined
  }

  return undefined
}

// ───────────────────────────── booleans ─────────────────────────────

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "✓", "✔", "on", "wahr", "vrai", "sí", "si"])
const FALSE_WORDS = new Set(["false", "no", "n", "0", "off", "falsch", "faux"])

/** Returns `null` for blank input and `undefined` for unparseable input. */
export function parseBoolean(input: unknown): boolean | null | undefined {
  if (typeof input === "boolean") return input
  if (input == null) return null
  const s = String(input).trim().toLowerCase()
  if (s === "") return null
  if (TRUE_WORDS.has(s)) return true
  if (FALSE_WORDS.has(s)) return false
  return undefined
}

// ───────────────────────────── formatting ─────────────────────────────

const currencyFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
})
const integerFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

export function formatCurrency(v: number | null | undefined): string {
  return v == null ? "" : currencyFmt.format(v)
}
export function formatInteger(v: number | null | undefined): string {
  return v == null ? "" : integerFmt.format(v)
}
/** ISO `YYYY-MM-DD` → unambiguous display string, e.g. `26 Sept 2026` */
export function formatIsoDate(v: string | null | undefined): string {
  if (!v) return ""
  const [y, m, d] = v.split("-").map(Number)
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)))
}
