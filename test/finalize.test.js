import { test } from "node:test"
import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { OpenCodeLoopPlugin } from "../src/index.js"
const {
  finalizeActiveRun, stopLoop, activeRuns, dueTimers, stopWatchdog,
  readState, writeState,
  forgetSession, knownSessions, sessionStatuses, sessionStatusSeenAt,
  maybeRunDueJobs, staleActiveRun,
} = OpenCodeLoopPlugin.internals

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

test("maybeRunDueJobs finalizes an aged active run instead of dropping it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocl-aged-"))
  const sid = "ses_aged"
  // paused so no new run fires after the finalize; timeoutMs 1s makes the
  // run older than its activeGuard but far below the 45s stale threshold
  const job = promptJob({ id: "aged1", name: "aged", paused: true, timeoutMs: 1000 })
  await writeState(dir, sid, { jobs: [job] })
  activeRuns.set(sid, { jobId: job.id, job, startedAt: Date.now() - 5_000 })
  sessionStatuses.set(sid, "idle")

  await maybeRunDueJobs(dir, stubClient, sid)
  cleanupTimers(sid)
  // maybeRunDueJobs calls rememberSession, which starts the global 2.5s
  // heartbeat interval; without forgetting the session here that interval
  // has no way to self-clear (knownSessions never empties) and the test
  // process hangs after this test completes.
  forgetSession(sid)

  assert.equal(activeRuns.has(sid), false)
  const state = await readState(dir, sid)
  assert.ok(state.jobs[0].lastFinishedAt > 0)
})

test("staleActiveRun defers to an explicit --timeout before reaping", () => {
  const sid = "ses_timeout"
  const job = promptJob({ id: "t1", timeoutMs: 600_000 })
  // 2 minutes old: past the 45s default threshold but well within timeout
  activeRuns.set(sid, { jobId: job.id, job, startedAt: Date.now() - 120_000 })
  assert.equal(staleActiveRun(sid), false)
  // past timeout + 30s grace: now reapable
  activeRuns.set(sid, { jobId: job.id, job, startedAt: Date.now() - 700_000 })
  assert.equal(staleActiveRun(sid), true)
  activeRuns.delete(sid)
})
