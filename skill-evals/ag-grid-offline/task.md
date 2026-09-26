Our users copy data between this AG Grid (src/App.tsx) and Excel all day, and
they add rows while a column filter is active. Please make these work
reliably:

1. Copy/paste of cell ranges must round-trip cleanly with Excel, in both
   directions — including values Excel formats (e.g. "1,200") and cells that
   contain line breaks.
2. Add an "Add row" button with `data-testid="add-row"` that inserts a new
   row.
3. While a filter is active, rows the user adds or edits must not disappear
   out from under them.

Keep `window.__gridApi` working. Make sure the app type-checks
(`npm run typecheck`). The AG Grid documentation website is not reachable
from this environment.
