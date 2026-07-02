import { test } from "node:test"
import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as entry from "../src/index.js"

// OpenCode's plugin loader invokes every export of the entry module as a
// plugin factory and throws on non-function exports; this pins that contract.
test("plugin entry exposes only the plugin function", () => {
  assert.deepEqual(Object.keys(entry).sort(), ["OpenCodeLoopPlugin", "default"])
  assert.equal(typeof entry.OpenCodeLoopPlugin, "function")
  assert.equal(entry.default, entry.OpenCodeLoopPlugin)
})

// Installers copy src/index.js standalone into the plugins dir; a relative
// import in the entry would break every install path.
test("plugin entry works when copied standalone", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-entry-"))
  const target = path.join(dir, "opencode-loop.js")
  await fs.copyFile(new URL("../src/index.js", import.meta.url), target)
  const copied = await import(pathToFileURL(target).href)
  assert.equal(typeof copied.default, "function")
  assert.equal(typeof copied.default.internals, "object")
})
