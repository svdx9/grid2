#!/usr/bin/env node
/**
 * Offline AG Grid reference, read from the INSTALLED packages.
 *
 * The published .d.ts files carry the API docs (descriptions, defaults,
 * @agModule, @initial, @deprecated) for exactly the version in node_modules,
 * and dist/package/main.esm.mjs is readable, unminified source. This script
 * turns both into answers without any network access.
 *
 *   node ag-lookup.mjs version
 *   node ag-lookup.mjs doc <name> [--all]     JSDoc + declaration for an option / colDef prop / api method
 *   node ag-lookup.mjs module <name>...       which module(s) a name needs
 *   node ag-lookup.mjs search <regex> [--in options|coldef|api|all]
 *                                             find members by name or doc text (discovery)
 *   node ag-lookup.mjs modules [regex]        list exported modules (community / enterprise)
 *   node ag-lookup.mjs source <regex> [-C n] [--max n]
 *                                             grep the implementation (behaviour the docs don't state)
 *   node ag-lookup.mjs docs <regex> [-C n] [--max n]
 *                                             search the docs snapshot for the installed version
 *                                             (create it with snapshot-docs.mjs)
 *
 * Options: --root <dir> (project dir to resolve node_modules from; default cwd)
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
const bool = (name) => {
  const i = argv.indexOf(name)
  if (i === -1) return false
  argv.splice(i, 1)
  return true
}

const root = path.resolve(flag("--root", process.cwd()))
const context = Number(flag("-C", "3"))
const max = Number(flag("--max", "20"))
const scope = flag("--in", "all")
const showAll = bool("--all")
const [cmd, ...rest] = argv

function findPackage(name) {
  let dir = root
  for (;;) {
    const candidate = path.join(dir, "node_modules", name)
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const PKGS = ["ag-grid-community", "ag-grid-enterprise"]
const pkgDirs = Object.fromEntries(PKGS.map((p) => [p, findPackage(p)]))
if (!pkgDirs["ag-grid-community"]) {
  console.error(`ag-grid-community is not installed under ${root} (run npm install, or pass --root).`)
  process.exit(2)
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

const SCOPES = {
  options: /entities\/gridOptions\.d\.ts$/,
  coldef: /entities\/colDef\.d\.ts$/,
  api: /api\/gridApi\.d\.ts$/,
}

let members
/** Every documented member: { name, doc, decl, file, owner } */
function loadMembers() {
  if (members) return members
  members = []
  for (const pkg of PKGS) {
    const dir = pkgDirs[pkg]
    if (!dir) continue
    const typesDir = path.join(dir, "dist", "types", "src")
    if (!fs.existsSync(typesDir)) continue
    for (const file of walk(typesDir)) {
      const text = fs.readFileSync(file, "utf8")
      const re =
        /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\n\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)(\??)\s*([:(<][^\n]*)/g
      let m
      while ((m = re.exec(text))) {
        const before = text.slice(0, m.index)
        const owner =
          [...before.matchAll(/^(?:export\s+)?(?:declare\s+)?(?:interface|class|type)\s+([A-Za-z_$][\w$]*)/gm)].pop()?.[1] ?? ""
        const doc = m[1]
          .split("\n")
          .map((l) => l.replace(/^\s*\* ?/, "").trimEnd())
          .join("\n")
          .trim()
        members.push({
          name: m[2],
          doc,
          decl: `${m[2]}${m[3]}${m[4]}`.trim(),
          file: path.relative(root, file),
          owner,
        })
      }
    }
  }
  return members
}

const inScope = (m) => scope === "all" || (SCOPES[scope] && SCOPES[scope].test(m.file))
const tag = (doc, name) =>
  [...doc.matchAll(new RegExp(`@${name}\\s*([^\\n]*)`, "g"))].map((x) => x[1].trim())

function printMember(m) {
  console.log(`── ${m.owner ? m.owner + "." : ""}${m.name}   (${m.file})`)
  console.log(m.doc)
  console.log(`  ${m.decl}`)
  console.log()
}

function version() {
  for (const name of [...PKGS, "ag-grid-react", "ag-grid-angular", "ag-grid-vue3"]) {
    const dir = findPackage(name)
    if (dir) console.log(`${name}@${JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version}`)
  }
}

function doc(names) {
  if (!names.length) return usage()
  for (const name of names) {
    const found = loadMembers().filter((m) => m.name === name && inScope(m))
    if (!found.length) {
      console.log(`No documented member named "${name}". Try: search ${name}`)
      continue
    }
    // Prefer the primary definitions (GridOptions, ColDef, GridApi) unless --all
    const primary = found.filter((m) => Object.values(SCOPES).some((r) => r.test(m.file)))
    for (const m of showAll || !primary.length ? found : primary) printMember(m)
    if (!showAll && primary.length && found.length > primary.length)
      console.log(`(${found.length - primary.length} more declarations elsewhere; add --all)`)
  }
}

function moduleOf(names) {
  if (!names.length) return usage()
  for (const name of names) {
    const found = loadMembers().filter((m) => m.name === name && inScope(m))
    const mods = [...new Set(found.flatMap((m) => tag(m.doc, "agModule")))]
    const initial = found.some((m) => /@initial\b/.test(m.doc))
    const deprecated = found.flatMap((m) => tag(m.doc, "deprecated"))
    console.log(
      `${name}: ${mods.length ? mods.join(" | ") : found.length ? "(core — no module tag)" : "NOT FOUND"}` +
        (initial ? "  [@initial: only read at grid creation]" : "") +
        (deprecated.length ? `  [DEPRECATED: ${deprecated[0]}]` : "")
    )
  }
}

function search(pattern) {
  if (!pattern) return usage()
  const re = new RegExp(pattern, "i")
  const hits = loadMembers().filter((m) => inScope(m) && (re.test(m.name) || re.test(m.doc)))
  const seen = new Set()
  let shown = 0
  for (const m of hits) {
    const key = `${m.owner}.${m.name}`
    if (seen.has(key)) continue
    seen.add(key)
    if (shown++ >= max) break
    const first = m.doc.split("\n").find((l) => l && !l.startsWith("@")) ?? ""
    const mods = tag(m.doc, "agModule")
    console.log(`${m.owner}.${m.name}${mods.length ? `  [${mods.join(" | ")}]` : ""}\n    ${first.slice(0, 160)}`)
  }
  if (seen.size === 0) console.log(`No members match /${pattern}/i in scope "${scope}".`)
  else if (hits.length > shown) console.log(`… more results, narrow the pattern or raise --max`)
}

function listModules(pattern) {
  const re = pattern ? new RegExp(pattern, "i") : null
  for (const pkg of PKGS) {
    const dir = pkgDirs[pkg]
    if (!dir) continue
    const main = path.join(dir, "dist", "types", "src", "main.d.ts")
    const text = fs.existsSync(main) ? fs.readFileSync(main, "utf8") : ""
    const names = [...new Set([...text.matchAll(/\b([A-Z]\w*Module)\b/g)].map((m) => m[1]))]
      .filter((n) => !re || re.test(n))
      .sort()
    console.log(`${pkg} (${names.length}):\n  ${names.join("\n  ")}`)
  }
}

function source(pattern) {
  if (!pattern) return usage()
  const re = new RegExp(pattern)
  let shown = 0
  for (const pkg of PKGS) {
    const dir = pkgDirs[pkg]
    const file = dir && path.join(dir, "dist", "package", "main.esm.mjs")
    if (!file || !fs.existsSync(file)) continue
    const lines = fs.readFileSync(file, "utf8").split("\n")
    for (let i = 0; i < lines.length && shown < max; i++) {
      if (!re.test(lines[i])) continue
      shown++
      console.log(`── ${path.relative(root, file)}:${i + 1}`)
      for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++)
        console.log(`${j === i ? ">" : " "} ${String(j + 1).padStart(6)}  ${lines[j]}`)
    }
  }
  if (!shown) console.log(`No source lines match /${pattern}/.`)
  else if (shown >= max) console.log(`… stopped at --max ${max}`)
}

function installedVersion() {
  const dir = pkgDirs["ag-grid-community"]
  return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version
}

function docs(pattern) {
  if (!pattern) return usage()
  const version = installedVersion()
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "references", "docs", version)
  if (!fs.existsSync(dir)) {
    console.log(
      `No docs snapshot for ${version} at ${path.relative(root, dir)}.\n` +
        `Create one where git can reach the AG Grid repo (or a mirror):\n` +
        `  node ${path.relative(root, path.dirname(new URL(import.meta.url).pathname))}/snapshot-docs.mjs [--repo <mirror>]\n` +
        `Meanwhile use: doc / search / source.`
    )
    return
  }
  const re = new RegExp(pattern, "i")
  let shown = 0
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "INDEX.md").sort()) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n")
    const hits = lines.flatMap((l, i) => (re.test(l) ? [i] : []))
    if (!hits.length) continue
    if (shown++ >= max) break
    console.log(`── ${file.replace(/\.md$/, "")}  (${hits.length} match${hits.length === 1 ? "" : "es"}, ${path.relative(root, path.join(dir, file))})`)
    const i = hits[0]
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++)
      console.log(`${j === i ? ">" : " "} ${lines[j]}`)
  }
  if (!shown) console.log(`No docs lines match /${pattern}/i.`)
  else if (shown > max) console.log(`… more pages match; narrow the pattern or raise --max`)
}

function usage() {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ""))
  process.exit(1)
}

switch (cmd) {
  case "version": version(); break
  case "doc": doc(rest); break
  case "module": moduleOf(rest); break
  case "search": search(rest.join(" ")); break
  case "modules": listModules(rest[0]); break
  case "source": source(rest.join(" ")); break
  case "docs": docs(rest.join(" ")); break
  default: usage()
}
