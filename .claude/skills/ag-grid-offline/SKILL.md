---
name: ag-grid-offline
description: Use BEFORE writing, changing, debugging or reviewing code that uses AG Grid (ag-grid-community, ag-grid-enterprise, ag-grid-react/angular/vue3) — including column definitions, editing, clipboard/copy-paste, Excel round trips, CSV/Excel export, filtering, modules and theming. Works without network access: answers API questions from the installed packages and carries tested rules for behaviour the docs don't describe. Use alongside or instead of the official ag-dev skill, especially in sandboxes where ag-grid.com is unreachable.
---

# AG Grid, offline-first

Your training data lags the installed version, and in many environments
ag-grid.com is blocked. **Never stall or guess because the docs are
unreachable** — the installed packages are the authoritative reference for the
exact version in use, and this skill carries the rules the docs don't state.

Scripts live next to this file. Run them from the project root with `node`
(no dependencies, no network):

```bash
S=.claude/skills/ag-grid-offline/scripts        # adjust if installed elsewhere
node $S/ag-lookup.mjs version                   # installed AG packages
node $S/ag-lookup.mjs doc cellSelection         # JSDoc + type for an option / colDef prop / api method
node $S/ag-lookup.mjs module alwaysPassFilter getAllDisplayedColumns   # which module each needs
node $S/ag-lookup.mjs search "always be displayed" --in options        # discover features by description
node $S/ag-lookup.mjs modules Filter            # list exported modules
node $S/ag-lookup.mjs source "suppressQuotes" -C 6                      # read the implementation
node $S/ag-lookup.mjs docs "copyHeadersToClipboard"   # search the docs snapshot, if present
node $S/check-modules.mjs src                   # every used feature has its module registered
```

## Lookup order

1. **Existing code** in the project — follow its patterns.
2. **This skill's references** (below) for the topic you're touching.
3. **The installed package** via `ag-lookup.mjs`:
   - `search` replaces the docs index: it matches names *and* doc text, so
     "is there a built-in way to keep rows visible under a filter?" →
     `search "always be displayed"` → `alwaysPassFilter`.
   - `doc` gives the description, default, `@agModule`, `@initial`
     (only read at creation) and `@deprecated` for that exact version.
   - `source` answers "what does it actually do" — edge cases, event order,
     which `type` a callback receives. Prefer it over assumptions.
4. **Docs snapshot**, if one exists: `ag-lookup.mjs docs <regex>` searches
   `references/docs/<installed version>/` (395 pages for 36.2). Create it
   wherever git can reach the AG Grid repo or an internal mirror:
   `node $S/snapshot-docs.mjs [--repo <mirror>]`. It includes every
   `upgrading-to-ag-grid-N` page, so upgrade work can run offline too.
5. **ag-grid.com**, only if reachable. If one fetch fails, don't retry —
   go back to step 3. When another skill says "consult the docs", steps 3–4
   satisfy it.

State in your summary which facts came from the installed source rather than
docs, so a reviewer knows what was verified.

## At the start of any grid task

1. `ag-lookup.mjs version` — know what you're writing against.
2. Make sure dev validations are on (`enableDevValidations()` in v36+, or
   register `ValidationModule`, both only outside production). Without them a
   misconfiguration is a terse `error #200` — or nothing at all.
3. `check-modules.mjs` — fix anything it reports before adding features.

## Rules that apply everywhere

- **Modules.** Every option/colDef prop/api method may need a module; an
  unregistered one makes the feature silently inert. Check with `module` or
  `check-modules.mjs`, never from memory. Prototyping: `AllCommunityModule` /
  `AllEnterpriseModule`, then narrow. If `ag-grid-enterprise` is a
  dependency, use the Enterprise feature rather than hand-rolling it.
- **Prefer the built-in feature**, and `search` before concluding there isn't
  one. Unfamiliar ≠ unsupported.
- **`getRowId`** returning a stable string whenever data changes after load.
- **One parse path.** Put input parsing in `colDef.valueParser` so typing,
  paste, fill handle and Ctrl+D all share it. Return `params.oldValue` for
  invalid input — the default parsers write `null`.
- **`stopEditingWhenCellsLoseFocus: true`**, and `api.stopEditing()` before
  programmatic export/add/delete, or the in-progress edit is lost.
- **React:** module-level constants or `useMemo`/`useCallback` for every
  non-primitive grid prop (`columnDefs`, `defaultColDef`, `cellSelection`,
  export params, `getRowId`, callbacks such as `alwaysPassFilter` — a new
  function reference there re-runs filtering).
- **Locale:** `navigator.language` can be a tag `Intl` rejects
  (`en-US@posix`) and crash formatters at startup — validate it.
- Check `@deprecated` with `doc` before using any API you remember (e.g.
  `tooltipValueGetter` is deprecated in 36.2 in favour of `tooltip`).

## Topic references — load the one you're touching

| Working on | Read |
| --- | --- |
| Copy/paste, cell ranges, fill handle, Excel round trip | `references/clipboard.md` |
| CSV / Excel export | `references/export.md` |
| Editing, editors, undo, adding/deleting rows | `references/editing.md` |
| Column filters, quick filter, adding rows while filtered | `references/filtering.md` |
| Spreadsheet-like behaviour: row numbers, empty rows below the data, infinite rows | `references/sheet-like.md` |
| Setup, modules, theming (incl. shadcn/Tailwind), licence | `references/setup.md` |
| Testing grid behaviour in a browser | `references/verification.md` |

## Definition of done

- `check-modules.mjs` exits 0.
- Type check passes.
- The behaviour you touched is exercised in a real browser (Playwright) with
  the console fixture from `references/verification.md`: **zero** AG Grid
  errors or warnings.
- Rules in the topic reference you loaded are either followed or the
  deviation is explained.
