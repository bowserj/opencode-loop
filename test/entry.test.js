import { test } from "node:test"
import assert from "node:assert/strict"
import * as entry from "../src/index.js"

// OpenCode's plugin loader invokes every export of the entry module as a
// plugin factory and throws on non-function exports; this pins that contract.
test("plugin entry exposes only the plugin function", () => {
  assert.deepEqual(Object.keys(entry).sort(), ["OpenCodeLoopPlugin", "default"])
  assert.equal(typeof entry.OpenCodeLoopPlugin, "function")
  assert.equal(entry.default, entry.OpenCodeLoopPlugin)
})
