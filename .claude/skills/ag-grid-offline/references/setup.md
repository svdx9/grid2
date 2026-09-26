# Setup: modules, dev validation, React, theming, licence

Verified against AG Grid 36.2.0.

## Modules

- Since v33 every feature is a module imported from `ag-grid-community` /
  `ag-grid-enterprise` and registered with `ModuleRegistry.registerModules([...])`
  (or the React `modules` prop). The old `@ag-grid-community/*` packages
  stopped at 32.x.
- **Unregistered module = silently inert feature.** API methods need modules
  too, and the mapping isn't guessable: in 36.2 `getAllDisplayedColumns` →
  `ColumnApiModule`, `applyTransaction` → `ClientSideRowModelApiModule`,
  `redrawRows` and `getRowNode` → `RowApiModule`, `flashCells` →
  `HighlightChangesModule` (pulled in by `ClipboardModule`).
- Modules pull in dependencies (`ClipboardModule` includes `CsvExportModule`
  and `HighlightChangesModule`), which `check-modules.mjs` accounts for.
- Don't memorise: `ag-lookup.mjs module <name>` and `check-modules.mjs`.
  `@agModule A / B / C` means any one of them.
- `ag-lookup.mjs modules` lists what exists; Enterprise-only modules are
  under `ag-grid-enterprise`.

## Dev validation

```ts
import { enableDevValidations } from "ag-grid-community" // v36+
if (import.meta.env.DEV) enableDevValidations()
// v35 and below: ModuleRegistry.registerModules([ValidationModule])
```

Attach console capture **before** the page loads when testing — module
errors are emitted during grid initialisation.

## React

- Grid container needs a height (the grid fills its parent; a parent with no
  height gives a zero-height grid).
- Stable props: module-level constants for static config (`cellSelection`,
  export params, `getRowId`), `useMemo`/`useCallback` otherwise.
  `rowData` in `useState`; update it with transactions, not new arrays, when
  you want to keep row state.
- `memo()` the grid wrapper when the parent re-renders often (status bars,
  toolbars) and keep callbacks passed to it stable.
- Expose the API only through `onGridReady` (store it in a ref).

## Theming (Theming API, v33+)

- `themeQuartz.withParams({...})` accepts CSS values, including
  `var(--token)` and `color-mix(...)`, so the grid can follow a design
  system's variables (and light/dark switching) with no JS.
  `examples/theme.ts` maps every relevant param to shadcn/ui tokens.
- `browserColorScheme: "inherit"` so native inputs follow the page.
- Don't combine with the legacy `ag-grid.css` themes.

## Licence (Enterprise)

`LicenseManager.setLicenseKey(key)` from `ag-grid-enterprise`, e.g. from
`import.meta.env.VITE_AG_GRID_LICENSE_KEY`. Without a key everything works in
trial mode with a console notice and watermark — that console notice is not
an `AG Grid: error/warning` line and doesn't fail the console fixture.

## Locale

Formatters built at module load with `navigator.language` crash on tags
`Intl` rejects (`en-US@posix` in some headless/Linux environments). Validate
with `Intl.getCanonicalLocales` after stripping `@…`/`.…` suffixes
(`resolveLocale` in `examples/locale.ts`).
