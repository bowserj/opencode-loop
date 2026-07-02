# opencode-loop Bug Fixes and Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three confirmed correctness bugs (goal-finalize crash, premature run finalization, broken Windows installer path) plus two hygiene issues, and add a `node:test` unit suite wired into `npm run check`.

**Architecture:** All fixes are in-place edits to `src/index.js` and `scripts/loopd.mjs`. Testability comes from exporting internal pure functions from `src/index.js` (the module has no import-time side effects — timers only start on events), not from splitting files. Tests live in `test/*.test.js` and run via Node's built-in test runner.

**Tech Stack:** Node.js ESM, `node:test` + `node:assert/strict`, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-bugfixes-and-tests-design.md`

## Global Constraints

- Zero new runtime or dev dependencies; tests use only `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path`.
- No changes to the public API, command surface, or state-file format (`version: 4`).
- `package.json` `files` whitelist must NOT gain `test/` (tests are not published).
- Node >= 20 required to run tests locally; CI (publish-npm.yml) uses Node 24 and runs `npm run check --if-present`.
- New exports from `src/index.js` are test-visibility only; add them to the single export block at the end of the file, below `export default OpenCodeLoopPlugin`.
- Tests that call functions which schedule timers (`finalizeActiveRun`, `stopLoop`) MUST clean up timers immediately after the awaited call (see `cleanupTimers` in Task 5) or `node --test` will hang/flake.
- Commit after every task with the exact message given in the task.

---

### Task 1: Test harness + parsing tests

**Files:**
- Modify: `package.json` (scripts block, lines 19-23)
- Modify: `src/index.js` (append export block at end of file, after line 1684)
- Create: `test/parse.test.js`

**Interfaces:**
- Consumes: existing internals `parseDuration`, `durationToText`, `parseCompactEvery`, `parseLoopArgs` in `src/index.js`.
- Produces: `npm test` script (`node --test test/`), `npm run check` chain, and the exports `parseDuration(value) -> number|null`, `durationToText(ms) -> string`, `parseCompactEvery(value) -> {compactEveryMs?|compactEveryRuns?}`, `parseLoopArgs(raw, defaults?) -> {ok:true, job}|{ok:false, error}`.

- [ ] **Step 1: Add test/check scripts to package.json**

Replace the `scripts` block in `package.json`:

```json
  "scripts": {
    "check": "node --check src/index.js && node --check scripts/install-node.mjs && node --check scripts/loopd.mjs && npm test",
    "test": "node --test test/",
    "install:global": "node scripts/install-node.mjs",
    "pack:zip": "node scripts/make-zip.mjs"
  },
```

- [ ] **Step 2: Write the failing test file**

Create `test/parse.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { parseDuration, durationToText, parseCompactEvery, parseLoopArgs } from "../src/index.js"

test("parseDuration parses supported units", () => {
  assert.equal(parseDuration("500ms"), 500)
  assert.equal(parseDuration("90s"), 90_000)
  assert.equal(parseDuration("5m"), 300_000)
  assert.equal(parseDuration("2h"), 7_200_000)
  assert.equal(parseDuration("1d"), 86_400_000)
  assert.equal(parseDuration("0"), 0)
})

test("parseDuration rejects invalid input", () => {
  assert.equal(parseDuration("abc"), null)
  assert.equal(parseDuration("5x"), null)
  assert.equal(parseDuration(""), null)
  assert.equal(parseDuration("-5m"), null)
})

test("durationToText formats durations", () => {
  assert.equal(durationToText(0), "every idle")
  assert.equal(durationToText(45_000), "45s")
  assert.equal(durationToText(300_000), "5m")
  assert.equal(durationToText(7_200_000), "2h")
  assert.equal(durationToText(86_400_000), "1d")
  assert.equal(durationToText(1234), "1234ms")
  assert.equal(durationToText(Infinity), "unknown")
})

test("parseCompactEvery accepts durations and run counts", () => {
  assert.deepEqual(parseCompactEvery("30m"), { compactEveryMs: 1_800_000 })
  assert.deepEqual(parseCompactEvery("5"), { compactEveryRuns: 5 })
  assert.deepEqual(parseCompactEvery("abc"), {})
})

test("parseLoopArgs parses interval and action", () => {
  const parsed = parseLoopArgs("5m fix the bug")
  assert.equal(parsed.ok, true)
  assert.equal(parsed.job.intervalMs, 300_000)
  assert.equal(parsed.job.action, "fix the bug")
  assert.equal(parsed.job.immediate, true)
  assert.equal(parsed.job.noOverlap, true)
  assert.equal(parsed.job.lastRunAt, 0)
})

test("parseLoopArgs parses flags with values and quoting", () => {
  const parsed = parseLoopArgs('0s --name nightly --max-runs 3 --verify "npm test" --safe build the feature')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.job.name, "nightly")
  assert.equal(parsed.job.maxRuns, 3)
  assert.equal(parsed.job.verifyCommand, "npm test")
  assert.equal(parsed.job.safe, true)
  assert.equal(parsed.job.action, "build the feature")
})

test("parseLoopArgs collects repeated flags", () => {
  const parsed = parseLoopArgs("0s --include-file a.md --include-file b.md do work")
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.job.includeFiles, ["a.md", "b.md"])
  assert.equal(parsed.job.action, "do work")
})

test("parseLoopArgs supports --watch as first token", () => {
  const parsed = parseLoopArgs("--watch progress.md update the summary")
  assert.equal(parsed.ok, true)
  assert.equal(parsed.job.intervalMs, 0)
  assert.deepEqual(parsed.job.watchPaths, ["progress.md"])
  assert.equal(parsed.job.action, "update the summary")
})

test("parseLoopArgs normalizes goal jobs", () => {
  const parsed = parseLoopArgs("0s --goal ship the feature")
  assert.equal(parsed.ok, true)
  assert.equal(parsed.job.kind, "goal")
  assert.equal(parsed.job.name, "goal")
  assert.equal(parsed.job.goalStatus, "active")
  assert.equal(parsed.job.noOverlap, true)
})

test("parseLoopArgs errors on bad interval and missing action", () => {
  assert.equal(parseLoopArgs("bogus").ok, false)
  assert.equal(parseLoopArgs("0s").ok, false)
  assert.equal(parseLoopArgs("0s --prompt-file loop-prompt.md").ok, true)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `SyntaxError: The requested module '../src/index.js' does not provide an export named 'parseCompactEvery'` (or similar missing-export error).

- [ ] **Step 4: Add the export block**

At the very end of `src/index.js`, after the existing line `export default OpenCodeLoopPlugin`, append:

```js

// Exported for tests only (visibility, not public API).
export {
  parseDuration, durationToText, parseCompactEvery, parseLoopArgs,
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 10 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add package.json src/index.js test/parse.test.js
git commit -m "test: add node:test harness and parsing tests"
```

---

### Task 2: Scheduling math tests

**Files:**
- Modify: `src/index.js` (export block only)
- Create: `test/schedule.test.js`

**Interfaces:**
- Consumes: export block from Task 1.
- Produces: exports `jobDueAt(job, current?) -> number` (epoch ms or `Infinity`), `dueJobs(state, force?) -> job[]`, `nextDueDelay(state) -> number` (ms or `Infinity`).

- [ ] **Step 1: Write the failing test file**

Create `test/schedule.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { jobDueAt, dueJobs, nextDueDelay } from "../src/index.js"

function baseJob(overrides = {}) {
  return {
    id: "j1",
    action: "work",
    intervalMs: 0,
    enabled: true,
    paused: false,
    runCount: 0,
    maxRuns: 0,
    maxRuntimeMs: 0,
    lastRunAt: 0,
    createdAt: new Date().toISOString(),
    watchPaths: [],
    ...overrides,
  }
}

test("jobDueAt: interval-0 jobs are due now", () => {
  const t = Date.now()
  assert.equal(jobDueAt(baseJob(), t), t)
})

test("jobDueAt: paused, disabled, maxed-out, and watch jobs are never due", () => {
  const t = Date.now()
  assert.equal(jobDueAt(baseJob({ paused: true }), t), Infinity)
  assert.equal(jobDueAt(baseJob({ enabled: false }), t), Infinity)
  assert.equal(jobDueAt(baseJob({ maxRuns: 2, runCount: 2 }), t), Infinity)
  assert.equal(jobDueAt(baseJob({ watchPaths: ["a.md"] }), t), Infinity)
})

test("jobDueAt: interval jobs are due lastRunAt + interval", () => {
  const t = Date.now()
  const job = baseJob({ intervalMs: 60_000, lastRunAt: t - 10_000 })
  assert.equal(jobDueAt(job, t), t + 50_000)
})

test("jobDueAt: finished goal jobs are never due", () => {
  const t = Date.now()
  for (const goalStatus of ["completed", "blocked", "cleared"]) {
    assert.equal(jobDueAt(baseJob({ kind: "goal", goalStatus }), t), Infinity)
  }
  assert.equal(jobDueAt(baseJob({ kind: "goal", goalStatus: "active" }), t), t)
})

test("jobDueAt: jobs past max runtime are due immediately (for teardown)", () => {
  const t = Date.now()
  const job = baseJob({
    intervalMs: 3_600_000,
    lastRunAt: t,
    maxRuntimeMs: 3_600_000,
    createdAt: new Date(t - 7_200_000).toISOString(),
  })
  assert.equal(jobDueAt(job, t), t)
})

test("dueJobs: force bypasses interval but not paused/disabled", () => {
  const fresh = baseJob({ id: "fresh", intervalMs: 60_000, lastRunAt: Date.now() })
  const paused = baseJob({ id: "paused", paused: true })
  const state = { jobs: [fresh, paused] }
  assert.deepEqual(dueJobs(state, false).map((job) => job.id), [])
  assert.deepEqual(dueJobs(state, true).map((job) => job.id), ["fresh"])
})

test("nextDueDelay: soonest job wins; empty state is Infinity", () => {
  const state = { jobs: [baseJob({ intervalMs: 60_000, lastRunAt: Date.now() - 10_000 })] }
  const delay = nextDueDelay(state)
  assert.ok(delay > 49_000 && delay <= 50_000, `delay was ${delay}`)
  assert.equal(nextDueDelay({ jobs: [] }), Infinity)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — missing export `jobDueAt`.

- [ ] **Step 3: Extend the export block**

Replace the export block at the end of `src/index.js` with:

```js
// Exported for tests only (visibility, not public API).
export {
  parseDuration, durationToText, parseCompactEvery, parseLoopArgs,
  jobDueAt, dueJobs, nextDueDelay,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 17 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/schedule.test.js
git commit -m "test: cover due-time scheduling math"
```

---

### Task 3: Safety and prompt-decoration tests

**Files:**
- Modify: `src/index.js` (export block only)
- Create: `test/safety.test.js`

**Interfaces:**
- Consumes: export block from Task 2.
- Produces: exports `dangerousShell(command) -> boolean`, `actionKind(action, job?) -> "compact"|"goal"|"prompt"|"command"|"shell"`, `decoratePrompt(job) -> string`, `sameLoopDefinition(a, b) -> boolean`.

- [ ] **Step 1: Write the failing test file**

Create `test/safety.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { dangerousShell, actionKind, decoratePrompt, sameLoopDefinition } from "../src/index.js"

test("dangerousShell flags destructive commands", () => {
  assert.equal(dangerousShell("rm -rf /tmp/x"), true)
  assert.equal(dangerousShell("git reset --hard HEAD~1"), true)
  assert.equal(dangerousShell("git push origin main"), true)
  assert.equal(dangerousShell("git clean -fd"), true)
  assert.equal(dangerousShell("terraform destroy -auto-approve"), true)
  assert.equal(dangerousShell("kubectl delete pod web"), true)
  assert.equal(dangerousShell("deploy the app to production"), true)
})

test("dangerousShell allows ordinary commands", () => {
  assert.equal(dangerousShell("npm test"), false)
  assert.equal(dangerousShell("git status"), false)
  assert.equal(dangerousShell("node --check src/index.js"), false)
})

test("actionKind routes by prefix and forced kind", () => {
  assert.equal(actionKind("/compact", {}), "compact")
  assert.equal(actionKind("/summarize", {}), "compact")
  assert.equal(actionKind("/loop-status", {}), "command")
  assert.equal(actionKind("! npm test", {}), "shell")
  assert.equal(actionKind("$ ls", {}), "shell")
  assert.equal(actionKind("continue the work", {}), "prompt")
  assert.equal(actionKind("anything", { kind: "goal" }), "goal")
  assert.equal(actionKind("anything", { kind: "compact" }), "compact")
  assert.equal(actionKind("anything", { kind: "shell" }), "shell")
  assert.equal(actionKind("/looks-like-command", { kind: "prompt" }), "prompt")
})

test("decoratePrompt returns action unchanged when no flags apply", () => {
  assert.equal(decoratePrompt({ action: "do it" }), "do it")
})

test("decoratePrompt appends loop instructions for flags", () => {
  const decorated = decoratePrompt({
    action: "do it",
    askNever: true,
    batch: 3,
    progressFile: "progress.md",
  })
  assert.ok(decorated.startsWith("do it\n\nOpenCode loop instructions:"))
  assert.ok(decorated.includes("Do not ask the user questions"))
  assert.ok(decorated.includes("at most 3 unfinished TODO"))
  assert.ok(decorated.includes("progress.md"))
})

test("sameLoopDefinition compares normalized definitions", () => {
  const a = { name: "dev", intervalMs: 0, action: "build  the  app", kind: "prompt", promptFile: "" }
  const b = { name: "dev", intervalMs: 0, action: "build the app", kind: "prompt", promptFile: "" }
  assert.equal(sameLoopDefinition(a, b), true)
  assert.equal(sameLoopDefinition(a, { ...b, intervalMs: 60_000 }), false)
  assert.equal(sameLoopDefinition(a, { ...b, action: "other" }), false)
  assert.equal(sameLoopDefinition(null, b), false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — missing export `dangerousShell`.

- [ ] **Step 3: Extend the export block**

Replace the export block at the end of `src/index.js` with:

```js
// Exported for tests only (visibility, not public API).
export {
  parseDuration, durationToText, parseCompactEvery, parseLoopArgs,
  jobDueAt, dueJobs, nextDueDelay,
  dangerousShell, actionKind, decoratePrompt, sameLoopDefinition,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 23 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/safety.test.js
git commit -m "test: cover shell safety checks and prompt decoration"
```

---

### Task 4: State persistence tests

**Files:**
- Modify: `src/index.js` (export block only)
- Create: `test/state.test.js`

**Interfaces:**
- Consumes: export block from Task 3.
- Produces: exports `readState(directory, sessionID) -> Promise<{version:4, jobs:[]}>`, `writeState(directory, sessionID, state) -> Promise<void>`, `statePath(directory, sessionID) -> string`.

- [ ] **Step 1: Write the failing test file**

Create `test/state.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { readState, writeState, statePath } from "../src/index.js"

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — missing export `readState`.

- [ ] **Step 3: Extend the export block**

Replace the export block at the end of `src/index.js` with:

```js
// Exported for tests only (visibility, not public API).
export {
  parseDuration, durationToText, parseCompactEvery, parseLoopArgs,
  jobDueAt, dueJobs, nextDueDelay,
  dangerousShell, actionKind, decoratePrompt, sameLoopDefinition,
  readState, writeState, statePath,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 26 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/state.test.js
git commit -m "test: cover state persistence round-trip and corruption fallback"
```

---

### Task 5: Fix B1 — goal-mode finalize crash (`const job` reassignment)

**Files:**
- Modify: `src/index.js:1138-1191` (`finalizeActiveRun`) and export block
- Create: `test/finalize.test.js`

**Interfaces:**
- Consumes: `readState`/`writeState` exports from Task 4.
- Produces: exports `finalizeActiveRun(directory, client, sessionID, options?) -> Promise<void>`, `activeRuns: Map<sessionID, {jobId, job, startedAt, timer?}>`, `dueTimers: Map<sessionID, Timeout>`, `stopWatchdog(sessionID) -> void`. Also the in-file test helpers `stubClient` and `cleanupTimers` reused by the tests Tasks 6-8 append to `test/finalize.test.js`.

- [ ] **Step 1: Write the failing regression test**

Create `test/finalize.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  finalizeActiveRun, activeRuns, dueTimers, stopWatchdog,
  readState, writeState,
} from "../src/index.js"

const stubClient = {
  app: { log: async () => ({}) },
  tui: { showToast: async () => ({}) },
  session: { prompt: async () => ({}), status: async () => ({}) },
}

// finalizeActiveRun/stopLoop schedule due timers and a 5s watchdog interval;
// without cleanup the test process never exits.
function cleanupTimers(sessionID) {
  const timer = dueTimers.get(sessionID)
  if (timer) clearTimeout(timer)
  dueTimers.delete(sessionID)
  stopWatchdog(sessionID)
}

function goalJob(overrides = {}) {
  return {
    id: "g1",
    name: "goal",
    kind: "goal",
    action: "ship the feature",
    goalStatus: "active",
    intervalMs: 0,
    enabled: true,
    paused: false,
    runCount: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

test("finalizeActiveRun completes a goal job without throwing (B1)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-finalize-"))
  const sid = "ses_goal"
  const job = goalJob()
  await writeState(dir, sid, { jobs: [job] })
  activeRuns.set(sid, { jobId: job.id, job, startedAt: Date.now() })

  await finalizeActiveRun(dir, stubClient, sid)
  cleanupTimers(sid)

  assert.equal(activeRuns.has(sid), false)
  const state = await readState(dir, sid)
  assert.equal(state.jobs.length, 1)
  assert.ok(state.jobs[0].lastFinishedAt > 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/finalize.test.js`
Expected: FAIL — `TypeError: Assignment to constant variable.` Note: on current code the export of `finalizeActiveRun`/`activeRuns`/`dueTimers`/`stopWatchdog` is missing, so first extend the export block (Step 3) and re-run; THEN the failure must be the TypeError, proving the bug.

- [ ] **Step 3: Extend the export block**

Replace the export block at the end of `src/index.js` with:

```js
// Exported for tests only (visibility, not public API).
export {
  parseDuration, durationToText, parseCompactEvery, parseLoopArgs,
  jobDueAt, dueJobs, nextDueDelay,
  dangerousShell, actionKind, decoratePrompt, sameLoopDefinition,
  readState, writeState, statePath,
  finalizeActiveRun, activeRuns, dueTimers, stopWatchdog,
}
```

Re-run `node --test test/finalize.test.js` — expected: FAIL with `TypeError: Assignment to constant variable.`

- [ ] **Step 4: Fix the const declaration**

In `src/index.js` inside `finalizeActiveRun` (line 1143), change:

```js
  const job = (state.jobs || []).find((candidate) => candidate.id === active.jobId)
```

to:

```js
  let job = (state.jobs || []).find((candidate) => candidate.id === active.jobId)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/finalize.test.js`
Expected: PASS — 1 test passes.
Then run the whole suite: `npm test` — expected: 27 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/index.js test/finalize.test.js
git commit -m "fix: goal-mode finalize crashed on const reassignment"
```

---

### Task 6: Fix B2 — honor forceStale in finalizeActiveRun

**Files:**
- Modify: `src/index.js:1138-1141` (`finalizeActiveRun` head) and export block
- Modify: `test/finalize.test.js` (append tests)

**Interfaces:**
- Consumes: `stubClient`, `cleanupTimers` from `test/finalize.test.js` (same file); `staleActiveRun(sessionID) -> boolean` (existing internal, gets exported here).
- Produces: `finalizeActiveRun(directory, client, sessionID, options = {})` where `options.forceStale === true` means "finalize only if the active run is stale (default threshold 45 s from `startedAt`)"; without the option it finalizes unconditionally.

- [ ] **Step 1: Write the failing tests**

Append to `test/finalize.test.js`:

```js
function promptJob(overrides = {}) {
  return {
    id: "p1",
    name: "dev",
    action: "continue",
    intervalMs: 0,
    enabled: true,
    paused: false,
    runCount: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

test("forceStale leaves fresh active runs untouched (B2)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-finalize-"))
  const sid = "ses_fresh"
  const job = promptJob()
  await writeState(dir, sid, { jobs: [job] })
  activeRuns.set(sid, { jobId: job.id, job, startedAt: Date.now() })

  await finalizeActiveRun(dir, stubClient, sid, { forceStale: true })
  cleanupTimers(sid)

  assert.equal(activeRuns.has(sid), true)
  const state = await readState(dir, sid)
  assert.equal(state.jobs[0].lastFinishedAt, undefined)
  activeRuns.delete(sid)
})

test("forceStale finalizes stale active runs (B2)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-finalize-"))
  const sid = "ses_stale"
  const job = promptJob({ id: "p2" })
  await writeState(dir, sid, { jobs: [job] })
  activeRuns.set(sid, { jobId: job.id, job, startedAt: Date.now() - 60_000 })

  await finalizeActiveRun(dir, stubClient, sid, { forceStale: true })
  cleanupTimers(sid)

  assert.equal(activeRuns.has(sid), false)
  const state = await readState(dir, sid)
  assert.ok(state.jobs[0].lastFinishedAt > 0)
})
```

- [ ] **Step 2: Run tests to verify the fresh-run test fails**

Run: `node --test test/finalize.test.js`
Expected: FAIL — "forceStale leaves fresh active runs untouched (B2)" fails because current code finalizes unconditionally (`activeRuns.has(sid)` is `false`, `lastFinishedAt` is set). The stale-run test passes on current code; that is expected.

- [ ] **Step 3: Implement the forceStale gate**

In `src/index.js`, change the head of `finalizeActiveRun` (lines 1138-1141) from:

```js
async function finalizeActiveRun(directory, client, sessionID) {
  const active = activeRuns.get(sessionID)
  if (!active) return
  clearActiveRun(sessionID)
```

to:

```js
async function finalizeActiveRun(directory, client, sessionID, options = {}) {
  const active = activeRuns.get(sessionID)
  if (!active) return
  // forceStale callers (heartbeat, pre-run sweep) can fire while the assistant
  // turn is still running; only reap runs past the stale threshold so verify,
  // checkpoints, and --timeout act on finished turns.
  if (options.forceStale && !staleActiveRun(sessionID)) return
  clearActiveRun(sessionID)
```

Then add `staleActiveRun` to the export block (same block as Task 5, insert after `stopWatchdog`):

```js
  finalizeActiveRun, staleActiveRun, activeRuns, dueTimers, stopWatchdog,
```

No call-site changes are needed: lines 487 and 1248 already pass `{ forceStale: true }`, and the idle-confirmed call sites (877, 963) pass no options and keep finalizing unconditionally.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/finalize.test.js`
Expected: PASS — 3 tests pass.
Then run the whole suite: `npm test` — expected: 29 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/finalize.test.js
git commit -m "fix: heartbeat no longer finalizes in-progress runs; --timeout and verify act on finished turns"
```

---

### Task 7: Fix H2 — /loop-stop with a named target clears the active run

**Files:**
- Modify: `src/index.js:1410-1426` (`stopLoop`) and export block
- Modify: `test/finalize.test.js` (append test)

**Interfaces:**
- Consumes: `stubClient`, `cleanupTimers`, `activeRuns` from `test/finalize.test.js`.
- Produces: export `stopLoop(directory, client, sessionID, args) -> Promise<void>`; named-target removal now also clears the session's active run when the removed job owns it.

- [ ] **Step 1: Write the failing test**

Append to `test/finalize.test.js` (and add `stopLoop` to the import list at the top of the file):

```js
test("stopLoop with a named target clears that job's active run (H2)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-stop-"))
  const sid = "ses_stop"
  const alpha = promptJob({ id: "a1", name: "alpha" })
  const beta = promptJob({ id: "b1", name: "beta" })
  await writeState(dir, sid, { jobs: [alpha, beta] })
  activeRuns.set(sid, { jobId: alpha.id, job: alpha, startedAt: Date.now() })

  await stopLoop(dir, stubClient, sid, "alpha")
  cleanupTimers(sid)

  assert.equal(activeRuns.has(sid), false)
  const state = await readState(dir, sid)
  assert.deepEqual(state.jobs.map((job) => job.id), ["b1"])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/finalize.test.js`
Expected: FAIL — first with missing export `stopLoop`; add `stopLoop,` on its own line to the export block (after the `finalizeActiveRun, ...` line), re-run, and then the failure must be `activeRuns.has(sid)` being `true`.

- [ ] **Step 3: Implement the fix**

In `src/index.js` `stopLoop`, change the named-target branch from:

```js
  const state = await readState(directory, sessionID)
  const before = state.jobs.length
  state.jobs = state.jobs.filter((job, index) => !matchJob(job, target, index))
```

to:

```js
  const state = await readState(directory, sessionID)
  const before = state.jobs.length
  const removedIds = new Set(state.jobs.filter((job, index) => matchJob(job, target, index)).map((job) => job.id))
  state.jobs = state.jobs.filter((job) => !removedIds.has(job.id))
  const active = activeRuns.get(sessionID)
  if (active && removedIds.has(active.jobId)) clearActiveRun(sessionID)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/finalize.test.js`
Expected: PASS — 4 tests pass.
Then run the whole suite: `npm test` — expected: 30 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/finalize.test.js
git commit -m "fix: stopping a named loop clears its active run and timeout timer"
```

---

### Task 8: Fix H1 — prune session status maps with knownSessions

**Files:**
- Modify: `src/index.js:477-497` (`startHeartbeat`), new `forgetSession` helper next to `rememberSession` (line 471), export block
- Modify: `test/finalize.test.js` (append test)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: export `forgetSession(sessionID) -> void` plus exported maps `knownSessions`, `sessionStatuses`, `sessionStatusSeenAt` (all `Map` keyed by sessionID).

- [ ] **Step 1: Write the failing test**

Append to `test/finalize.test.js` (and add `forgetSession, knownSessions, sessionStatuses, sessionStatusSeenAt` to the import list):

```js
test("forgetSession clears all session tracking maps (H1)", () => {
  const sid = "ses_forget"
  knownSessions.set(sid, { seenAt: Date.now() })
  sessionStatuses.set(sid, "idle")
  sessionStatusSeenAt.set(sid, Date.now())

  forgetSession(sid)

  assert.equal(knownSessions.has(sid), false)
  assert.equal(sessionStatuses.has(sid), false)
  assert.equal(sessionStatusSeenAt.has(sid), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/finalize.test.js`
Expected: FAIL — missing export `forgetSession`.

- [ ] **Step 3: Implement forgetSession and wire it into the heartbeat**

In `src/index.js`, directly below `rememberSession` (after line 476), add:

```js
function forgetSession(sessionID) {
  knownSessions.delete(sessionID)
  sessionStatuses.delete(sessionID)
  sessionStatusSeenAt.delete(sessionID)
}
```

In `startHeartbeat`, change:

```js
      if (!info || now() - (info.seenAt || 0) > 12 * 60 * 60 * 1000) {
        knownSessions.delete(sessionID)
        continue
      }
```

to:

```js
      if (!info || now() - (info.seenAt || 0) > 12 * 60 * 60 * 1000) {
        forgetSession(sessionID)
        continue
      }
```

Replace the export block with its final form:

```js
// Exported for tests only (visibility, not public API).
export {
  parseDuration, durationToText, parseCompactEvery, parseLoopArgs,
  jobDueAt, dueJobs, nextDueDelay,
  dangerousShell, actionKind, decoratePrompt, sameLoopDefinition,
  readState, writeState, statePath,
  finalizeActiveRun, staleActiveRun, activeRuns, dueTimers, stopWatchdog,
  stopLoop,
  forgetSession, knownSessions, sessionStatuses, sessionStatusSeenAt,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 31 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/finalize.test.js
git commit -m "fix: prune session status maps alongside knownSessions sweep"
```

---

### Task 9: Fix B3 — Windows installer path in loopd.mjs

**Files:**
- Modify: `scripts/loopd.mjs:2-4` (imports) and `scripts/loopd.mjs:130` (`installTask`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `installTask` registers a valid script path on Windows. No unit test — the function is Windows-only and the CLI executes on import, so verification is `node --check` plus a help smoke run.

- [ ] **Step 1: Fix the import and path resolution**

In `scripts/loopd.mjs`, add to the imports at the top:

```js
import { fileURLToPath } from "node:url"
```

and in `installTask`, change:

```js
  const script = path.resolve(new URL(import.meta.url).pathname)
```

to:

```js
  const script = fileURLToPath(import.meta.url)
```

- [ ] **Step 2: Verify syntax and CLI smoke**

Run: `node --check scripts/loopd.mjs`
Expected: exit 0, no output.

Run: `node scripts/loopd.mjs help`
Expected: prints the "OpenCode Loop daemon" usage text and exits 0.

Run: `npm run check`
Expected: all syntax checks pass and the full 31-test suite passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/loopd.mjs
git commit -m "fix: resolve loopd script path with fileURLToPath for Windows Task Scheduler"
```
