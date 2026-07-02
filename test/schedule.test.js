import { test } from "node:test"
import assert from "node:assert/strict"
import { OpenCodeLoopPlugin } from "../src/index.js"
const { jobDueAt, dueJobs, nextDueDelay } = OpenCodeLoopPlugin.internals

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
