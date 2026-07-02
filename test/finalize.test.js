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
