#!/usr/bin/env node
/**
 * Snapshot the AG Grid docs for the INSTALLED version into
 * references/docs/<version>/, so agents can read them without network.
 *
 * Source: the docs' Markdoc source in the AG Grid repository at the matching
 * release tag (release-<version>). Run it wherever git can reach that repo —
 * GitHub, or an internal mirror (--repo) in locked-down environments — e.g.
 * in CI, a dev container build, or a session start hook.
 *
 *   node snapshot-docs.mjs [--version 36.2.0] [--repo <git url>] [--out <dir>] [--examples]
 *
 * --examples also copies each page's runnable examples (much larger).
 * The snapshot is for local use: check AG Grid's terms before redistributing it.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}
const withExamples = argv.includes("--examples")
const skillDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")

function installedVersion() {
  let dir = process.cwd()
  for (;;) {
    const pkg = path.join(dir, "node_modules", "ag-grid-community", "package.json")
    if (fs.existsSync(pkg)) return JSON.parse(fs.readFileSync(pkg, "utf8")).version
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const version = flag("--version", installedVersion())
if (!version) {
  console.error("Can't determine the AG Grid version: install ag-grid-community or pass --version")
  process.exit(2)
}
const repo = flag("--repo", "https://github.com/ag-grid/ag-grid.git")
const out = path.resolve(flag("--out", path.join(skillDir, "references", "docs", version)))
const DOCS = "documentation/ag-grid-docs/src/content/docs"

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ag-docs-"))
const git = (...args) => execFileSync("git", args, { cwd: tmp, stdio: ["ignore", "pipe", "pipe"] }).toString()
try {
  console.log(`Fetching docs for ${version} from ${repo} …`)
  execFileSync(
    "git",
    ["clone", "--quiet", "--depth", "1", "--filter=blob:none", "--no-checkout", "--branch", `release-${version}`, repo, tmp],
    { stdio: ["ignore", "inherit", "inherit"] }
  )
  const patterns = [`/${DOCS}/*/index.mdoc`]
  if (withExamples) patterns.push(`/${DOCS}/*/_examples/**`)
  git("sparse-checkout", "set", "--no-cone", ...patterns)
  git("checkout", "--quiet")

  const docsDir = path.join(tmp, DOCS)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const index = []
  for (const slug of fs.readdirSync(docsDir).sort()) {
    const page = path.join(docsDir, slug, "index.mdoc")
    if (!fs.existsSync(page)) continue
    const text = fs.readFileSync(page, "utf8")
    fs.writeFileSync(path.join(out, `${slug}.md`), text)
    const title = text.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? slug
    const enterprise = /^enterprise:\s*true/m.test(text)
    index.push(`- \`${slug}\` — ${title}${enterprise ? " (Enterprise)" : ""}`)
    const examples = path.join(docsDir, slug, "_examples")
    if (withExamples && fs.existsSync(examples))
      fs.cpSync(examples, path.join(out, "_examples", slug), { recursive: true })
  }
  fs.writeFileSync(
    path.join(out, "INDEX.md"),
    `# AG Grid ${version} docs snapshot\n\n` +
      `Markdoc source from ${repo} @ release-${version}. Page for slug X: \`X.md\`.\n` +
      `\`{% ... %}\` tags are Markdoc (examples, API tables); the prose around them is the documentation.\n` +
      `Search: \`node scripts/ag-lookup.mjs docs <regex>\`\n\n` +
      index.join("\n") +
      "\n"
  )
  console.log(`Wrote ${index.length} pages to ${path.relative(process.cwd(), out)}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
