# opencode-loop: bug fixes and test suite — design

Date: 2026-07-02
Status: approved

## Goal

Fix three confirmed correctness bugs and two minor hygiene issues, and add a
unit test suite so regressions of this kind cannot ship silently again. No
public API, command surface, or state-file format changes.

## Scope decision

Chosen scope: **bug fixes + tests** (surgical fixes only and full modular
restructure were considered and declined). Testability approach: **Option A**
— export internal pure functions from `src/index.js` so tests can import them
directly; do not split the file into modules. `src/index.js` has no
import-time side effects (timers only start on events), so importing it from
tests is safe.

## Confirmed bugs

### B1. Goal-mode finalize crashes (src/index.js:1143, 1185)

`finalizeActiveRun` declares `const job` and later reassigns it:

```js
if (isGoalJob(job)) job = await runGoalChecks(directory, sessionID, job, client)
```

Every finalize of a goal-job run throws `TypeError: Assignment to constant
variable` after verify/postrun but before `writeState`, so goal check
results, failure counts, goal reports, and the reschedule are lost. The error
is swallowed by callers' `.catch` logging, which is why it ships unnoticed.

**Fix:** `const job` → `let job`.

### B2. Heartbeat finalizes runs prematurely; `--timeout` never fires

`finalizeActiveRun` is called with `{ forceStale: true }` from the heartbeat
(line 487) and from the top of `maybeRunDueJobs` (line 1248), but its
signature is `(directory, client, sessionID)` — the option is ignored and the
function finalizes unconditionally whenever an active run exists. The 2.5 s
heartbeat therefore finalizes every active run ~2.5 s after it fires, while
the assistant turn is still in progress. Consequences:

- `clearActiveRun` cancels the `--timeout` abort timer, so `--timeout`
  effectively never fires.
- `--verify` runs against a half-finished working tree; spurious failures
  increment `failureCount` and can pause the loop via `--max-failures` or
  `--pause-on-verify-fail`.
- Git checkpoints capture mid-turn state.
- `staleActiveRun`-based busy recovery in `sessionStatusType` loses its
  signal because `activeRuns` is emptied within 2.5 s.

**Fix:** signature becomes `finalizeActiveRun(directory, client, sessionID,
options = {})`. When `options.forceStale` is truthy, finalize **only if
`staleActiveRun(sessionID)`** is true; otherwise return without touching the
active run. The two idle-confirmed call sites (lines 877 and 963, inside
`scheduleIdleWork` and the due-timer callback) keep finalizing
unconditionally — the caller has just confirmed the session is idle, meaning
the turn has ended.

### B3. Windows daemon installer builds an invalid path (scripts/loopd.mjs:130)

`path.resolve(new URL(import.meta.url).pathname)` on Windows yields
`/C:/...` (plus `%20` for spaces), which `path.resolve` mangles into
`C:\C:\...`. `install-task` is Windows-only, so the Task Scheduler command it
registers is broken on the only platform it supports.

**Fix:** use `fileURLToPath(import.meta.url)` from `node:url`.

## Minor hygiene

- **H1.** `sessionStatuses` and `sessionStatusSeenAt` maps are never pruned.
  Prune both alongside the existing 12-hour `knownSessions` sweep inside the
  heartbeat.
- **H2.** `stopLoop` with a named target removes the job from state but does
  not clear its active run or timeout timer. Clear them when the removed job
  is the session's active run.

## Test suite

- Framework: built-in `node:test` + `node:assert` (zero new dependencies,
  matching the package's zero-dep philosophy).
- Enable imports by adding `export` to the pure internals of `src/index.js`:
  `parseLoopArgs`, `parseDuration`, `durationToText`, `parseCompactEvery`,
  `jobDueAt`, `dueJobs`, `nextDueDelay`, `dangerousShell`, `actionKind`,
  `decoratePrompt`, `sameLoopDefinition`, `goalReportText`, plus
  `readState`/`writeState` and `finalizeActiveRun` for the integration-style
  tests. Also export the `activeRuns` map (and `staleActiveRun`) so
  `finalize.test.js` can seed an active run with a chosen `startedAt`. No
  behavior change — visibility only.
- Test files under `test/`:
  - `parse.test.js` — durations, flag parsing (`--watch`, `--include-file`,
    quoting, kind flags, goal defaults), `parseCompactEvery`, error cases.
  - `schedule.test.js` — `jobDueAt` / `dueJobs` / `nextDueDelay` gating:
    paused, disabled, maxRuns, maxRuntime, watch paths, interval-0, goal
    status (completed/blocked/cleared never due).
  - `safety.test.js` — `dangerousShell` patterns, `actionKind` routing,
    `decoratePrompt` flag decorations.
  - `state.test.js` — `readState`/`writeState` round-trip and corrupt-file
    fallback in a temp directory.
  - `finalize.test.js` — regression tests with a stub SDK client and temp
    state dir: (1) finalizing a goal job completes without throwing and
    persists check results (B1); (2) `forceStale` finalize returns without
    clearing a non-stale active run, and finalizes a stale one (B2).
- `package.json`: add `"test": "node --test test/"`; `check` becomes the
  existing syntax checks plus `npm test`, so the release/publish CI workflows
  that run `check` pick the tests up without workflow edits.

## Error handling and risk

All fixes preserve the plugin's existing fault posture: failures are logged
to `loop.log` and surfaced as toasts, never thrown to OpenCode. State files
under `.opencode/opencode-loop/` keep the same shape (`version: 4`), so
existing sessions are unaffected. `files` in `package.json` already includes
`src` and `scripts`; the new `test/` directory is intentionally not published.
