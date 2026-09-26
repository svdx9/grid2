#!/usr/bin/env node
/**
 * Static check: every AG Grid option / colDef property / api method used in
 * the source has one of its required modules registered.
 *
 * An unregistered module makes a feature silently inert in production (the
 * explanatory error only appears with dev validations on). Module
 * requirements come from the installed .d.ts `@agModule` tags and module
 * dependencies from the installed source, so the check matches the exact
 * version in node_modules and needs no network.
 *
 *   node check-modules.mjs [srcDir=src] [--root <projectDir>] [--json]
 *
 * Exit code 1 when something is missing. Heuristic: it matches names, so it
 * may flag a same-named key on an unrelated object — read the location.
 */
import fs from "node:fs"
import path from "node:path"

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  if (i === -1) return fallback
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}
const asJson = argv.includes("--json") && argv.splice(argv.indexOf("--json"), 1)
const root = path.resolve(flag("--root", process.cwd()))
const srcDir = path.resolve(root, argv[0] ?? "src")

function findPackage(name) {
  let dir = root
  for (;;) {
    const c = path.join(dir, "node_modules", name)
    if (fs.existsSync(path.join(c, "package.json"))) return c
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const pkgs = ["ag-grid-community", "ag-grid-enterprise"].map(findPackage).filter(Boolean)
if (!pkgs.length) {
  console.error("ag-grid-community is not installed")
  process.exit(2)
}

// ── module dependency graph from the implementation ─────────────────────────
const graph = new Map() // module -> Set(deps)
for (const dir of pkgs) {
  const file = path.join(dir, "dist", "package", "main.esm.mjs")
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, "utf8")
  const alias = new Map()
  for (const m of text.matchAll(/\b(\w+) as (\w+)\b/g)) alias.set(m[2], m[1])
  const norm = (n) => alias.get(n) ?? n
  const arrays = new Map()
  for (const m of text.matchAll(/^var (\w+) = \[([\s\S]*?)\];/gm)) arrays.set(m[1], m[2])
  const idents = (body) => {
    const out = []
    for (const m of body.matchAll(/(\.\.\.)?\b([A-Za-z_$][\w$]*)\b(?:\.with\([^)]*\))?/g)) {
      if (m[1] && arrays.has(m[2])) out.push(...idents(arrays.get(m[2])))
      else if (/Module\d*$/.test(m[2])) out.push(norm(m[2]))
    }
    return out
  }
  for (const m of text.matchAll(/^var (\w+Module) = \{([\s\S]*?)^\};/gm)) {
    const name = m[1]
    const deps = new Set(graph.get(name) ?? [])
    for (const d of m[2].matchAll(/dependsOn:\s*\[([\s\S]*?)\]/g)) idents(d[1]).forEach((x) => deps.add(x))
    graph.set(name, deps)
  }
}
const closure = (roots) => {
  const seen = new Set()
  const stack = [...roots]
  while (stack.length) {
    const n = stack.pop()
    if (seen.has(n)) continue
    seen.add(n)
    for (const d of graph.get(n) ?? []) stack.push(d)
  }
  return seen
}

// ── @agModule requirements from the type definitions ────────────────────────
const requirements = new Map() // name -> { modules: string[][] (any-of), kind }
for (const dir of pkgs) {
  const types = path.join(dir, "dist", "types", "src")
  const files = {
    option: path.join(types, "entities", "gridOptions.d.ts"),
    colDef: path.join(types, "entities", "colDef.d.ts"),
    api: path.join(types, "api", "gridApi.d.ts"),
  }
  for (const [kind, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, "utf8")
    for (const m of text.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\n\s*(?:readonly\s+)?(\w+)\??\s*[:(<]/g)) {
      const tag = m[1].match(/@agModule\s*([^\n]*)/)
      if (!tag) continue
      const anyOf = [...tag[1].matchAll(/`?(\w+Module)`?/g)].map((x) => x[1])
      if (anyOf.length) requirements.set(`${kind}:${m[2]}`, anyOf)
    }
  }
}

// ── scan the project ────────────────────────────────────────────────────────
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(m?[jt]sx?|vue|svelte)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(srcDir)
const registered = new Set()
const uses = [] // { name, kind, file, line }
const has = (k) => requirements.has(k)
for (const file of files) {
  const text = fs.readFileSync(file, "utf8")
  if (!/ag-grid-/.test(text) && !/\.api\b|gridApi|GridApi/.test(text)) continue
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "")
  // registrations: anything named *Module inside registerModules([...]) or a `modules` prop/option
  for (const m of code.matchAll(/(?:registerModules\s*\(|modules\s*[=:]\s*\{?)\s*\[([\s\S]*?)\]/g))
    for (const id of m[1].matchAll(/\b(\w+Module)\b/g)) registered.add(id[1])
  const lineOf = (i) => code.slice(0, i).split("\n").length
  // api calls: something.api.X( / api.X( / gridApi.X(
  for (const m of code.matchAll(/\b(?:api|gridApi|\w*Api)(?:\.current)?\??\.(\w+)\s*\(/g))
    if (has(`api:${m[1]}`)) uses.push({ name: m[1], kind: "api", file, line: lineOf(m.index) })
  // JSX props and object keys
  for (const m of code.matchAll(/(?:^|[\s{,(])(\w+)\s*(?:=\s*[{"']|:\s*[^:\s])/g)) {
    const kind = has(`option:${m[1]}`) ? "option" : has(`colDef:${m[1]}`) ? "colDef" : null
    if (kind) uses.push({ name: m[1], kind, file, line: lineOf(m.index + m[0].indexOf(m[1])) })
  }
}

const available = closure(registered)
const missing = []
const seen = new Set()
for (const u of uses) {
  const anyOf = requirements.get(`${u.kind}:${u.name}`)
  if (anyOf.some((mod) => available.has(mod))) continue
  const key = `${u.kind}:${u.name}`
  if (seen.has(key)) continue
  seen.add(key)
  missing.push({ ...u, file: path.relative(root, u.file), needsOneOf: anyOf })
}

if (asJson) {
  console.log(JSON.stringify({ registered: [...registered].sort(), missing }, null, 2))
} else {
  console.log(`Registered: ${[...registered].sort().join(", ") || "(none found)"}`)
  console.log(`Checked ${uses.length} usages in ${files.length} files against ${requirements.size} module-tagged members.`)
  if (!missing.length) console.log("OK — every used feature has a registered module.")
  for (const m of missing)
    console.log(`MISSING  ${m.file}:${m.line}  ${m.kind} "${m.name}" needs one of: ${m.needsOneOf.join(" | ")}`)
}
process.exit(missing.length ? 1 : 0)
