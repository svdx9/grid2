#!/usr/bin/env node
/**
 * Offline eval for the ag-grid-offline skill.
 *
 * Copies a small AG Grid app (fixture/) to a temp dir, gives a headless Claude
 * Code agent the task in task.md with web tools denied, then grades the result
 * with hidden Playwright tests the agent never sees, plus a type check and the
 * module checker.
 *
 *   node skill-evals/ag-grid-offline/run.mjs --variant with-skill|without-skill|reference|baseline
 *        [--port 5199] [--model <id>] [--max-turns 120] [--with-docs] [--out <dir>]
 *
 * reference = the known-good solution (proves the hidden tests are passable)
 * baseline  = the untouched fixture (proves the tests fail without work)
 *
 * Web tools, curl and wget are denied through the agent's settings. For hard
 * isolation run it inside your real network policy (or a network namespace
 * that only allows the model API).
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const argv = process.argv.slice(2)
const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
const variant = flag("--variant", "with-skill")
const port = flag("--port", "5199")
const model = flag("--model")
const maxTurns = flag("--max-turns", "120")
const withDocs = argv.includes("--with-docs")

const here = path.dirname(new URL(import.meta.url).pathname)
const repo = path.resolve(here, "../..")
const skillSrc = path.join(repo, ".claude/skills/ag-grid-offline")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const out = path.resolve(flag("--out", path.join(os.tmpdir(), `ag-offline-eval-${variant}-${stamp}`)))
const app = path.join(out, "app")
fs.mkdirSync(out, { recursive: true })

// ── workspace ────────────────────────────────────────────────────────────────
fs.cpSync(path.join(here, "fixture"), app, { recursive: true })
fs.symlinkSync(path.join(repo, "node_modules"), path.join(app, "node_modules"))
fs.mkdirSync(path.join(app, ".claude"), { recursive: true })
fs.writeFileSync(
  path.join(app, ".claude/settings.json"),
  JSON.stringify(
    { permissions: { deny: ["WebFetch", "WebSearch", "Bash(curl:*)", "Bash(wget:*)"] } },
    null,
    2
  )
)
if (variant === "with-skill") {
  fs.cpSync(skillSrc, path.join(app, ".claude/skills/ag-grid-offline"), {
    recursive: true,
    filter: (src) => withDocs || !src.includes(`${path.sep}references${path.sep}docs`),
  })
}
if (variant === "reference") fs.copyFileSync(path.join(here, "reference/App.tsx"), path.join(app, "src/App.tsx"))

// ── agent ────────────────────────────────────────────────────────────────────
const result = { variant, withDocs, out, agent: null, typecheck: null, modules: null, tests: null }
if (variant === "with-skill" || variant === "without-skill") {
  const task = fs.readFileSync(path.join(here, "task.md"), "utf8")
  const args = [
    "-p", task,
    "--output-format", "json",
    "--permission-mode", "acceptEdits",
    "--allowedTools", "Bash", "Read", "Edit", "Write", "Glob", "Grep", "Skill",
    "--disallowedTools", "WebFetch", "WebSearch",
    "--max-turns", maxTurns,
  ]
  if (model) args.push("--model", model)
  const started = Date.now()
  console.log(`[${variant}] agent working in ${app} …`)
  const run = spawnSync("claude", args, { cwd: app, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60 * 1000 })
  fs.writeFileSync(path.join(out, "agent.json"), run.stdout ?? "")
  fs.writeFileSync(path.join(out, "agent.stderr"), run.stderr ?? "")
  let parsed = null
  try { parsed = JSON.parse(run.stdout) } catch {}
  result.agent = {
    exitCode: run.status,
    minutes: +((Date.now() - started) / 60000).toFixed(1),
    turns: parsed?.num_turns,
    costUsd: parsed?.total_cost_usd,
    summary: parsed?.result?.slice(0, 2000),
  }
}

// ── grading ──────────────────────────────────────────────────────────────────
const tc = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: app, encoding: "utf8" })
result.typecheck = { ok: tc.status === 0, output: (tc.stdout + tc.stderr).slice(0, 2000) }

const cm = spawnSync("node", [path.join(skillSrc, "scripts/check-modules.mjs"), "src", "--root", app, "--json"], { encoding: "utf8" })
try { result.modules = JSON.parse(cm.stdout) } catch { result.modules = { error: cm.stdout + cm.stderr } }

const report = path.join(out, "hidden-report.json")
spawnSync("npx", ["playwright", "test", "-c", path.join(here, "hidden/playwright.config.ts")], {
  cwd: repo,
  encoding: "utf8",
  env: { ...process.env, EVAL_APP_DIR: app, EVAL_PORT: port, EVAL_REPORT: report },
})
try {
  const r = JSON.parse(fs.readFileSync(report, "utf8"))
  const specs = r.suites.flatMap(function collect(s) { return [...(s.specs ?? []), ...(s.suites ?? []).flatMap(collect)] })
  result.tests = specs.map((s) => ({
    title: s.title,
    ok: s.ok,
    error: s.ok ? undefined : s.tests?.[0]?.results?.[0]?.error?.message?.split("\n").slice(0, 3).join(" ").slice(0, 300),
  }))
} catch (e) {
  result.tests = { error: String(e) }
}

fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2))
const passed = Array.isArray(result.tests) ? result.tests.filter((t) => t.ok).length : 0
const total = Array.isArray(result.tests) ? result.tests.length : "?"
console.log(`\n[${variant}] hidden tests ${passed}/${total} · typecheck ${result.typecheck.ok ? "ok" : "FAIL"} · modules ${result.modules?.missing?.length ? `${result.modules.missing.length} missing` : "ok"}`)
if (Array.isArray(result.tests)) for (const t of result.tests) console.log(`  ${t.ok ? "✓" : "✗"} ${t.title}${t.ok ? "" : `\n      ${t.error}`}`)
if (result.agent) console.log(`  agent: ${result.agent.minutes} min, ${result.agent.turns} turns, exit ${result.agent.exitCode}`)
console.log(`  details: ${out}`)
