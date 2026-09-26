# Offline eval for the `ag-grid-offline` skill

Measures whether a coding agent can do real AG Grid work **without the docs
website**, with and without the skill.

- `fixture/` — a small AG Grid 36.2 React app with a plain grid.
- `task.md` — what the agent is asked to do (Excel-grade copy/paste, an
  "Add row" button, rows that don't vanish under an active filter).
- `hidden/` — Playwright acceptance tests the agent never sees. Every test
  also fails on any AG Grid console error/warning.
- `reference/App.tsx` — a known-good solution.
- `run.mjs` — builds a temp workspace, runs `claude -p` with web tools
  denied, then grades with the hidden tests, a type check and
  `check-modules.mjs`.

```bash
node skill-evals/ag-grid-offline/run.mjs --variant baseline       # untouched app → should fail
node skill-evals/ag-grid-offline/run.mjs --variant reference      # known-good → should pass 7/7
node skill-evals/ag-grid-offline/run.mjs --variant without-skill --port 5212
node skill-evals/ag-grid-offline/run.mjs --variant with-skill --port 5211   # add --with-docs to include a docs snapshot
```

Needs: `npm install` at the repo root (the workspace symlinks its
`node_modules`), the `claude` CLI logged in, Chromium for Playwright
(`PW_CHROMIUM_PATH` if pre-installed). Each agent run takes minutes and
costs model usage; results go to a temp dir (`--out` to choose) as
`result.json`, `agent.json` (the full agent transcript summary) and the app
the agent produced.

Web access is denied through the agent's settings (WebFetch, WebSearch,
curl, wget). For hard isolation, run inside a network policy that only
allows the model API.

Single runs are noisy — run each variant several times before drawing
conclusions.

## Results (one run each, 2026-09-26, AG Grid 36.2.0, web tools denied)

| Variant | Hidden tests | Type check | Modules | Time | Turns | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (untouched app) | 0/7 | ✓ | ✓ | – | – | – |
| reference solution | 7/7 | ✓ | ✓ | – | – | – |
| **with skill** | **7/7** | ✓ | ✓ | 5.6 min | 37 | $1.11 |
| without skill | 4/7 | ✓ | ✓ | 15.3 min | 94 | $3.12 |

Without the skill the agent worked out the quote handling by reading
`node_modules` itself (that took most of its 94 turns), but missed Excel's
trailing newline (single-value paste into a range, blank written into the
next row), and hid new rows under a filter by moving them into pinned rows,
which the filter test counts as not displayed. With the skill it
used `alwaysPassFilter`, stripped the trailing row and appended overflow rows.

One run per variant is anecdotal; repeat before relying on the numbers.
