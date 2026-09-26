import { describe, expect, it } from "vitest"
import { excelSerialToIso, parseBoolean, parseDate, parseNumber, resolveLocale } from "./locale"

describe("resolveLocale", () => {
  it("cleans tags Intl would reject", () => {
    expect(resolveLocale(["en-US@posix"])).toBe("en-US")
    expect(resolveLocale(["de_DE.UTF-8"])).toBe("de-DE")
    expect(resolveLocale(["", "fr-FR"])).toBe("fr-FR")
    expect(() => resolveLocale(["!!"])).not.toThrow()
  })
})

describe("parseNumber", () => {
  const cases: [unknown, number | null | undefined, string?][] = [
    [42, 42],
    ["", null],
    ["   ", null],
    [null, null],
    ["1234.5", 1234.5],
    ["1,234.50", 1234.5],
    ["$1,234.50", 1234.5],
    ["-$1,234.50", -1234.5],
    ["$-1,234.50", -1234.5],
    ["(1,234.50)", -1234.5],
    ["1234-", -1234],
    ["−12", -12],
    ["12%", 0.12],
    ["7%", 0.07],
    ["1.2E+05", 120000],
    ["1 234.5", 1234.5],
    ["1 234.5", 1234.5],
    ["USD 10", 10],
    ["1,234,567", 1234567],
    ["abc", undefined],
    ["12abc", undefined],
    ["1-2", undefined],
    ["1.2.3,4", undefined],
    ["1.234,50", 1234.5, "de-DE"],
    ["€ 1.234,50", 1234.5, "de-DE"],
    ["1,5", 1.5, "de-DE"],
    ["1.500", 1500, "de-DE"],
    ["1.5", 1.5, "de-DE"],
    ["1,5", 1.5, "en-US"],
    ["1,500", 1500, "en-US"],
  ]
  it.each(cases)("%s → %s (%s)", (input, expected, locale = "en-US") => {
    expect(parseNumber(input, locale)).toBe(expected)
  })
})

describe("parseDate", () => {
  const cases: [unknown, string | null | undefined, string?][] = [
    ["", null],
    ["2026-09-26", "2026-09-26"],
    ["2026-9-6", "2026-09-06"],
    ["2026-09-26T00:00:00", "2026-09-26"],
    ["2026-09-26T00:00:00.000Z", "2026-09-26"],
    ["2026/09/26", "2026-09-26"],
    ["26/09/2026", "2026-09-26", "en-US"], // unambiguous: 26 can't be a month
    ["9/26/2026", "2026-09-26", "en-GB"], // unambiguous
    ["01/02/2026", "2026-01-02", "en-US"], // ambiguous → locale (M/D)
    ["01/02/2026", "2026-02-01", "en-GB"], // ambiguous → locale (D/M)
    ["01.02.2026", "2026-02-01", "de-DE"],
    ["26/09/26", "2026-09-26", "en-GB"],
    ["1/1/99", "1999-01-01", "en-US"],
    ["26-Sep-2026", "2026-09-26"],
    ["26 Sep 2026", "2026-09-26"],
    ["26 September 2026", "2026-09-26"],
    ["Sep 26, 2026", "2026-09-26"],
    ["September 26 2026", "2026-09-26"],
    ["46291", "2026-09-26"],
    ["31/02/2026", undefined, "en-GB"],
    ["2026-02-30", undefined],
    ["tomorrow", undefined],
    ["13/13/2026", undefined],
  ]
  it.each(cases)("%s → %s (%s)", (input, expected, locale = "en-US") => {
    expect(parseDate(input, locale)).toBe(expected)
  })

  it("serial round-trips", () => {
    expect(excelSerialToIso(45000)).toBe("2023-03-15")
  })
})

describe("parseBoolean", () => {
  it.each([
    [true, true],
    ["TRUE", true],
    ["FALSE", false],
    ["yes", true],
    ["No", false],
    ["1", true],
    ["0", false],
    ["", null],
    ["maybe", undefined],
  ] as const)("%s → %s", (input, expected) => {
    expect(parseBoolean(input)).toBe(expected)
  })
})
