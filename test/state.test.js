import { test } from "node:test"
import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { OpenCodeLoopPlugin } from "../src/index.js"
const { readState, writeState, statePath } = OpenCodeLoopPlugin.internals

test("writeState/readState round-trips jobs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-state-"))
  await writeState(dir, "ses_1", { jobs: [{ id: "a", action: "x" }] })
  const state = await readState(dir, "ses_1")
  assert.equal(state.version, 4)
  assert.equal(state.jobs.length, 1)
  assert.equal(state.jobs[0].id, "a")
  assert.ok(statePath(dir, "ses_1").endsWith(path.join(".opencode", "opencode-loop", "ses_1.json")))
})

test("readState returns empty state for missing session", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-state-"))
  assert.deepEqual(await readState(dir, "missing"), { version: 4, jobs: [] })
})

test("readState survives corrupt state files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-state-"))
  await writeState(dir, "ses_ok", { jobs: [] })
  await fs.writeFile(statePath(dir, "ses_bad"), "{ not json", "utf8")
  assert.deepEqual(await readState(dir, "ses_bad"), { version: 4, jobs: [] })
})
