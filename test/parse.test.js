import { test } from "node:test"
import assert from "node:assert/strict"
import { parseDuration, durationToText, parseCompactEvery, parseLoopArgs } from "../src/loop.js"

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
