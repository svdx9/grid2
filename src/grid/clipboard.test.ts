import { describe, expect, it } from "vitest"
import {
  buildExcelHtml,
  parseTsv,
  quoteTsvField,
  stripTrailingEmptyRows,
  unquoteTsvField,
} from "./clipboard"

/** Verbatim copy of AG Grid 36.2's paste tokenizer (ClipboardService stringToArray). */
function agGridStringToArray(strData: string, delimiter = "\t") {
  const data: string[][] = []
  const isNewline = (char: string) => char === "\r" || char === "\n"
  let insideQuotedField = false
  if (strData === "") return [[""]]
  for (let row = 0, column = 0, position = 0; position < strData.length; position++) {
    const previousChar = strData[position - 1]
    const currentChar = strData[position]
    const nextChar = strData[position + 1]
    const ensureDataExists = () => {
      if (!data[row]) data[row] = []
      if (!data[row][column]) data[row][column] = ""
    }
    ensureDataExists()
    if (currentChar === '"') {
      if (insideQuotedField) {
        if (nextChar === '"') {
          data[row][column] += '"'
          position++
        } else {
          insideQuotedField = false
        }
      } else if (previousChar === undefined || previousChar === delimiter || isNewline(previousChar)) {
        insideQuotedField = true
      }
    }
    if (!insideQuotedField && currentChar !== '"') {
      if (currentChar === delimiter) {
        column++
        ensureDataExists()
        continue
      } else if (isNewline(currentChar)) {
        column = 0
        row++
        ensureDataExists()
        if (currentChar === "\r" && nextChar === "\n") position++
        continue
      }
    }
    data[row][column] += currentChar
  }
  return data
}

describe("AG Grid paste tokenizer + unquoteTsvField", () => {
  const fields = ["plain", "multi\nline", 'with "quotes"\nand newline', "tab\there", "", '"lead', 'mid"quote']
  const tsv = fields.map(quoteTsvField).join("\t") + "\r\nx\ty\r\n"

  it("AG Grid alone leaves Excel's quoting in the values", () => {
    expect(agGridStringToArray(tsv)[0][1]).toBe('"multi\nline"')
  })

  it("unquoting restores the exact cell values", () => {
    const parsed = agGridStringToArray(tsv).map((r) => r.map(unquoteTsvField))
    expect(stripTrailingEmptyRows(parsed)).toEqual([fields, ["x", "y"]])
  })

  it("leaves unquoted and malformed values alone", () => {
    expect(unquoteTsvField('say "hi"')).toBe('say "hi"')
    expect(unquoteTsvField('"a"b"')).toBe('"a"b"')
    expect(unquoteTsvField('"')).toBe('"')
  })
})

describe("TSV quoting", () => {
  it("leaves plain values alone", () => {
    expect(quoteTsvField("hello, world")).toBe("hello, world")
    expect(quoteTsvField('say "hi"')).toBe('say "hi"')
  })
  it("quotes values Excel would quote", () => {
    expect(quoteTsvField("a\nb")).toBe('"a\nb"')
    expect(quoteTsvField("a\tb")).toBe('"a\tb"')
    expect(quoteTsvField('line1\n"quoted"')).toBe('"line1\n""quoted"""')
    expect(quoteTsvField('"starts with quote')).toBe('"""starts with quote"')
  })
  it("round-trips through the parser", () => {
    const fields = ["plain", "multi\nline", 'with "quotes"\nand newline', "tab\there", "", '"lead']
    const tsv = fields.map(quoteTsvField).join("\t") + "\r\n" + "x\ty"
    expect(parseTsv(tsv)).toEqual([fields, ["x", "y"]])
  })
})

describe("stripTrailingEmptyRows", () => {
  it("removes Excel's trailing line break", () => {
    expect(stripTrailingEmptyRows(parseTsv("a\tb\r\nc\td\r\n"))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
    expect(stripTrailingEmptyRows(parseTsv("single\r\n"))).toEqual([["single"]])
  })
  it("keeps a lone empty value (clearing paste)", () => {
    expect(stripTrailingEmptyRows([[""]])).toEqual([[""]])
  })
  it("keeps interior empty rows", () => {
    expect(stripTrailingEmptyRows([["a"], [""], ["b"]])).toEqual([["a"], [""], ["b"]])
  })
})

describe("buildExcelHtml", () => {
  it("escapes and types cells", () => {
    const html = buildExcelHtml(
      [["SKU", "Note"], ["00123", "<b>&\nx"]],
      [["header", "header"], ["text", "text"]]
    )
    expect(html).toContain("<th>SKU</th>")
    expect(html).toContain("mso-number-format:'\\@'")
    expect(html).toContain("&lt;b&gt;&amp;<br")
  })
})
