import { iconSetQuartzLight, themeQuartz } from "ag-grid-community"

/**
 * AG Grid theme driven entirely by the shadcn CSS variables, so the grid
 * follows light/dark mode and any theme change with no JS involved.
 * Sizes follow the Mira style (compact: text-xs, h-7 controls).
 */
export const shadcnMiraTheme = themeQuartz.withPart(iconSetQuartzLight).withParams({
  fontFamily: "inherit",
  fontSize: 12,
  headerFontSize: 12,
  headerFontWeight: 500,
  spacing: 6,
  rowHeight: 30,
  headerHeight: 32,
  iconSize: 14,
  borderRadius: "calc(var(--radius) * 0.8)",
  wrapperBorderRadius: "var(--radius)",
  browserColorScheme: "inherit",

  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  textColor: "var(--foreground)",
  subtleTextColor: "var(--muted-foreground)",
  borderColor: "var(--border)",
  accentColor: "var(--primary)",
  invalidColor: "var(--destructive)",

  chromeBackgroundColor: "var(--background)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--muted-foreground)",
  rowHoverColor: "color-mix(in oklch, var(--muted) 70%, transparent)",
  selectedRowBackgroundColor: "var(--accent)",
  rangeSelectionBorderColor: "var(--primary)",
  rangeSelectionBackgroundColor: "color-mix(in oklch, var(--primary) 8%, transparent)",
  rangeHeaderHighlightColor: "color-mix(in oklch, var(--primary) 7%, var(--muted))",
  rowNumbersSelectedColor: "color-mix(in oklch, var(--primary) 16%, var(--muted))",
  cellEditingBorder: { color: "var(--ring)", width: 1 },
  focusShadow: { radius: 3, spread: 0, color: "color-mix(in oklch, var(--ring) 50%, transparent)" },

  menuBackgroundColor: "var(--popover)",
  menuTextColor: "var(--popover-foreground)",
  menuBorder: { color: "color-mix(in oklch, var(--foreground) 10%, transparent)" },
  menuShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  panelBackgroundColor: "var(--popover)",
  inputBackgroundColor: "transparent",
  inputBorder: { color: "var(--input)" },
  inputFocusBorder: { color: "var(--ring)" },
  inputFocusShadow: { radius: 2, spread: 0, color: "color-mix(in oklch, var(--ring) 30%, transparent)" },
  tooltipBackgroundColor: "var(--foreground)",
  tooltipTextColor: "var(--background)",
  checkboxCheckedBackgroundColor: "var(--primary)",
  checkboxCheckedShapeColor: "var(--primary-foreground)",
  checkboxUncheckedBorderColor: "var(--input)",
})
