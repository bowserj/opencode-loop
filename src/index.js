import { promises as fs } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

const SERVICE = "opencode-loop"
const STATE_DIR = ".opencode/opencode-loop"
const DEFAULT_ACTIVE_GUARD_MS = 60_000
const MAX_WALK_FILES = 200
const MAX_WALK_BYTES = 2_000_000

const activeRuns = new Map()
const handled = new Map()

function now() {
  return Date.now()
}

function safeID(text) {
  return String(text || "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "job"
}

function durationToText(ms) {
  if (ms === 0) return "every idle"
  if (!Number.isFinite(ms)) return "unknown"
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  if (ms % 1_000 === 0) return `${ms / 1_000}s`
  return `${ms}ms`
}

function parseDuration(value) {
  const input = String(value || "").trim()
  if (input === "0") return 0
  const match = input.match(/^(\d+)\s*(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i)
  if (!match) return null

  const amount = Number.parseInt(match[1], 10)
  const unit = match[2].toLowerCase()

  if (!Number.isFinite(amount) || amount < 0) return null
  if (unit === "ms") return amount
  if (unit.startsWith("s")) return amount * 1_000
  if (unit.startsWith("m")) return amount * 60_000
  if (unit.startsWith("h")) return amount * 3_600_000
  if (unit.startsWith("d")) return amount * 86_400_000
  return null
}

function splitFirst(input) {
  const text = String(input || "").trim()
  const match = text.match(/^(\S+)\s*([\s\S]*)$/)
  if (!match) return ["", ""]
  return [match[1], (match[2] || "").trim()]
}

function stripOuterQuotes(text) {
  const input = String(text || "").trim()
  if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) {
    return input.slice(1, -1)
  }
  return input
}

function escapeRegExp(text) {
  return String(text).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
}

function takeFlag(rest, flag) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(flag)}(?=\\s|$)`, "i")
  const found = pattern.test(rest)
  return [found, rest.replace(pattern, " ").replace(/\s+/g, " ").trim()]
}

function takeFlagValue(rest, flag) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(flag)}\\s+(?:\"([^\"]*)\"|'([^']*)'|(\\S+))`, "i")
  const match = rest.match(pattern)
  if (!match) return [undefined, rest]
  const value = match[2] ?? match[3] ?? match[4]
  return [value, rest.replace(pattern, " ").replace(/\s+/g, " ").trim()]
}

function takeAllFlagValues(rest, flag) {
  const values = []
  let current = rest
  while (true) {
    const [value, next] = takeFlagValue(current, flag)
    if (value === undefined) return [values, current]
    values.push(value)
    current = next
  }
}

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseCompactEvery(value) {
  const input = String(value || "").trim()
  if (!input) return {}
  const duration = parseDuration(input)
  if (duration !== null) return { compactEveryMs: duration }
  const runs = parsePositiveInt(input, 0)
  return runs > 0 ? { compactEveryRuns: runs } : {}
}

function parseLoopArgs(raw, defaults = {}) {
  let input = String(raw || "").trim()
  let intervalMs = defaults.intervalMs ?? null
  let first = ""
  let rest = input

  if (!input && defaults.action) {
    rest = defaults.action
  } else {
    ;[first, rest] = splitFirst(input)
    if (first === "--watch") {
      intervalMs = defaults.intervalMs ?? 0
      rest = input
    } else if (first) {
      const parsedDuration = parseDuration(first)
      if (parsedDuration !== null) {
        intervalMs = parsedDuration
      } else if (intervalMs === null) {
        return {
          ok: false,
          error: "Usage: /loop 0s <prompt> | /loop 5m <prompt> | /loop 200m /compact | /loop 10m !npm test | /loop --watch progress.md <prompt>",
        }
      } else {
        rest = input
      }
    }
  }

  if (intervalMs === null) intervalMs = 0

  let immediate = defaults.immediate ?? true
  let maxRuns = defaults.maxRuns ?? 0
  let timeoutMs = defaults.timeoutMs ?? 0
  let name = defaults.name
  let until = defaults.until
  let testCommand = defaults.testCommand
  let verifyCommand = defaults.verifyCommand
  let preflightCommand = defaults.preflightCommand
  let branch = defaults.branch
  let stopFile = defaults.stopFile
  let progressFile = defaults.progressFile
  let batch = defaults.batch ?? 0
  let compactEveryRuns = defaults.compactEveryRuns ?? 0
  let compactEveryMs = defaults.compactEveryMs ?? 0
  let noOverlap = defaults.noOverlap ?? true
  let safe = defaults.safe ?? false
  let quiet = defaults.quiet ?? false
  let askNever = defaults.askNever ?? false
  let gitCheckpoint = defaults.gitCheckpoint ?? false
  let checkpointOnly = defaults.checkpointOnly ?? false
  let watchPaths = Array.isArray(defaults.watchPaths) ? [...defaults.watchPaths] : []

  let found
  let value

  ;[found, rest] = takeFlag(rest, "--no-now")
  if (found) immediate = false

  ;[found, rest] = takeFlag(rest, "--now")
  if (found) immediate = true

  ;[found, rest] = takeFlag(rest, "--no-overlap")
  if (found) noOverlap = true

  ;[found, rest] = takeFlag(rest, "--allow-overlap")
  if (found) noOverlap = false

  ;[found, rest] = takeFlag(rest, "--safe")
  if (found) safe = true

  ;[found, rest] = takeFlag(rest, "--quiet")
  if (found) quiet = true

  ;[found, rest] = takeFlag(rest, "--ask-never")
  if (found) askNever = true

  ;[found, rest] = takeFlag(rest, "--git-checkpoint")
  if (found) gitCheckpoint = true

  ;[found, rest] = takeFlag(rest, "--checkpoint-only")
  if (found) checkpointOnly = true

  ;[value, rest] = takeFlagValue(rest, "--max-runs")
  if (value !== undefined) maxRuns = parsePositiveInt(value, 0)

  ;[value, rest] = takeFlagValue(rest, "--timeout")
  if (value !== undefined) timeoutMs = parseDuration(value) ?? 0

  ;[value, rest] = takeFlagValue(rest, "--name")
  if (value !== undefined) name = value.trim()

  ;[value, rest] = takeFlagValue(rest, "--until")
  if (value !== undefined) until = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--test")
  if (value !== undefined) testCommand = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--verify")
  if (value !== undefined) verifyCommand = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--preflight")
  if (value !== undefined) preflightCommand = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--stop-file")
  if (value !== undefined) stopFile = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--progress-file")
  if (value !== undefined) progressFile = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--branch")
  if (value !== undefined) branch = stripOuterQuotes(value)

  ;[value, rest] = takeFlagValue(rest, "--batch")
  if (value !== undefined) batch = parsePositiveInt(value, 0)

  ;[value, rest] = takeFlagValue(rest, "--compact-every")
  if (value !== undefined) {
    const compact = parseCompactEvery(value)
    compactEveryRuns = compact.compactEveryRuns ?? compactEveryRuns
    compactEveryMs = compact.compactEveryMs ?? compactEveryMs
  }

  const watchResult = takeAllFlagValues(rest, "--watch")
  watchPaths.push(...watchResult[0].map(stripOuterQuotes).filter(Boolean))
  rest = watchResult[1]

  const action = stripOuterQuotes(rest || defaults.action || "")
  if (!action) {
    return { ok: false, error: "Missing action. Example: /loop 0s continue from progress.md" }
  }

  return {
    ok: true,
    job: {
      id: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      name: name || undefined,
      action,
      intervalMs,
      immediate,
      maxRuns,
      runCount: 0,
      lastRunAt: immediate ? 0 : now(),
      timeoutMs,
      until,
      noOverlap,
      safe,
      quiet,
      askNever,
      batch,
      testCommand,
      verifyCommand,
      preflightCommand,
      stopFile,
      progressFile,
      gitCheckpoint,
      checkpointOnly,
      branch,
      branchDone: false,
      compactEveryRuns,
      compactEveryMs,
      lastCompactAt: 0,
      lastCompactRunCount: 0,
      watchPaths: [...new Set(watchPaths)],
      watchSnapshot: {},
      createdAt: new Date().toISOString(),
      enabled: true,
      paused: false,
    },
  }
}

function getIdleSessionID(event) {
  const sessionID = event?.properties?.sessionID
  if (event?.type === "session.idle" && typeof sessionID === "string") return sessionID
  const status = event?.properties?.status
  if (
    event?.type === "session.status" &&
    typeof sessionID === "string" &&
    status &&
    typeof status === "object" &&
    status.type === "idle"
  ) {
    return sessionID
  }
  return undefined
}

function stateDir(directory) {
  return path.join(directory, STATE_DIR)
}

function statePath(directory, sessionID) {
  return path.join(stateDir(directory), `${safeID(sessionID)}.json`)
}

async function ensureDir(directory) {
  await fs.mkdir(directory, { recursive: true })
}

async function readState(directory, sessionID) {
  const filePath = statePath(directory, sessionID)
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"))
    return {
      version: 2,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    }
  } catch {
    return { version: 2, jobs: [] }
  }
}

async function writeState(directory, sessionID, state) {
  await ensureDir(stateDir(directory))
  await fs.writeFile(statePath(directory, sessionID), JSON.stringify({ version: 2, jobs: state.jobs || [] }, null, 2))
}

async function removeState(directory, sessionID) {
  try {
    await fs.unlink(statePath(directory, sessionID))
  } catch {}
}

function commandKey(sessionID, name, args) {
  return `${sessionID || "no-session"}:${name || ""}:${args || ""}`
}

function markHandled(sessionID, name, args) {
  const key = commandKey(sessionID, name, args)
  handled.set(key, now())
  for (const [item, time] of handled.entries()) {
    if (now() - time > 30_000) handled.delete(item)
  }
}

function wasHandled(sessionID, name, args) {
  const key = commandKey(sessionID, name, args)
  const time = handled.get(key)
  return typeof time === "number" && now() - time < 30_000
}

async function log(client, level, message, extra) {
  try {
    await client.app.log({
      body: extra === undefined ? { service: SERVICE, level, message } : { service: SERVICE, level, message, extra },
    })
  } catch {}
}

async function toast(client, message, variant = "info") {
  try {
    await client.tui.showToast({ body: { message, variant } })
  } catch {}
}

function isLoop(name) {
  return name === "loop"
}

function isLoopStop(name) {
  return name === "loop-stop"
}

function isLoopStatus(name) {
  return name === "loop-status"
}

function isLoopNow(name) {
  return name === "loop-now"
}

function isLoopRemove(name) {
  return name === "loop-remove"
}

function isLoopPause(name) {
  return name === "loop-pause"
}

function isLoopResume(name) {
  return name === "loop-resume"
}

function isLoopClear(name) {
  return name === "loop-clear"
}

function isLoopHelp(name) {
  return name === "loop-help"
}

function isLoopLogs(name) {
  return name === "loop-logs"
}

function isPreset(name) {
  return ["loop-dev", "loop-testfix", "loop-compact", "loop-progress", "loop-safe-dev"].includes(name)
}

function presetDefaults(name, args) {
  const [maybeDuration, rest] = splitFirst(args)
  const parsed = parseDuration(maybeDuration)
  const intervalMs = parsed === null ? 0 : parsed
  const extra = parsed === null ? String(args || "").trim() : rest

  if (name === "loop-compact") {
    return {
      intervalMs: intervalMs || parseDuration("200m"),
      action: extra || "/compact",
      name: "compact",
      immediate: false,
    }
  }

  if (name === "loop-testfix") {
    return {
      intervalMs,
      name: "testfix",
      safe: true,
      askNever: true,
      testCommand: extra || "npm test",
      action: `Run the project tests. Fix failures. Re-run the tests. Do not stop after reporting readiness. If the test command differs, infer it from package files. Test command hint: ${extra || "npm test"}`,
    }
  }

  if (name === "loop-progress") {
    return {
      intervalMs,
      name: "progress",
      safe: true,
      askNever: true,
      action: extra || "Read progress.md and continue the next unfinished TODO. Mark completed TODOs with [x]. Add new useful TODOs when you discover them.",
    }
  }

  if (name === "loop-safe-dev") {
    return {
      intervalMs,
      name: "safe-dev",
      safe: true,
      askNever: true,
      noOverlap: true,
      checkpointOnly: true,
      batch: 5,
      action: extra || "Develop the project from progress.md. Work in small safe batches. Mark completed TODOs with [x]. Add new ideas to progress.md. Run tests/lint/build if available.",
    }
  }

  return {
    intervalMs,
    name: "dev",
    askNever: true,
    action: extra || "Continue developing the project from progress.md. Mark completed TODOs with [x]. Add new ideas to progress.md. Run tests/lint/build if available.",
  }
}

function jobLabel(job) {
  const title = job.name ? `${job.name}: ` : ""
  const limit = job.maxRuns > 0 ? `, max ${job.maxRuns}` : ""
  const timeout = job.timeoutMs > 0 ? `, timeout ${durationToText(job.timeoutMs)}` : ""
  const verify = job.verifyCommand ? ", verify" : ""
  const preflight = job.preflightCommand ? ", preflight" : ""
  const stopFile = job.stopFile ? ", stop-file" : ""
  const compact = job.compactEveryRuns > 0 ? `, compact every ${job.compactEveryRuns} runs` : job.compactEveryMs > 0 ? `, compact every ${durationToText(job.compactEveryMs)}` : ""
  const watch = job.watchPaths?.length ? `, watch ${job.watchPaths.join(",")}` : ""
  const paused = job.paused ? ", paused" : ""
  return `${title}${durationToText(job.intervalMs)} -> ${job.action}${limit}${timeout}${compact}${verify}${preflight}${stopFile}${watch}${paused}`
}

function matchJob(job, target, index) {
  const text = String(target || "").trim()
  if (!text || text.toLowerCase() === "all") return true
  return job.id === text || job.name === text || String(index + 1) === text
}

async function addLoop(directory, client, sessionID, args, defaults = {}) {
  const parsed = parseLoopArgs(args, defaults)
  if (!parsed.ok) {
    await toast(client, parsed.error, "warning")
    await log(client, "warn", "Invalid loop command", { sessionID, args, error: parsed.error })
    return
  }

  if (parsed.job.watchPaths.length) {
    parsed.job.watchSnapshot = await snapshotPaths(directory, parsed.job.watchPaths)
  }

  const state = await readState(directory, sessionID)
  state.jobs.push(parsed.job)
  await writeState(directory, sessionID, state)

  await toast(client, `Loop added: ${jobLabel(parsed.job)}`, "success")
  await log(client, "info", "Loop added", { sessionID, job: parsed.job })
  await appendLoopLog(directory, "add", { sessionID, job: parsed.job.name || parsed.job.id, label: jobLabel(parsed.job) })
}

async function stopLoop(directory, client, sessionID, args) {
  const target = String(args || "").trim()
  if (!target || target.toLowerCase() === "all") {
    await removeState(directory, sessionID)
    clearActiveRun(sessionID)
    await toast(client, "All loops stopped for this session.", "success")
    await log(client, "info", "All loops stopped", { sessionID })
    return
  }

  const state = await readState(directory, sessionID)
  const before = state.jobs.length
  state.jobs = state.jobs.filter((job, index) => !matchJob(job, target, index))
  await writeState(directory, sessionID, state)
  await toast(client, `Stopped ${before - state.jobs.length} loop(s).`, "success")
}

async function updateJobState(directory, client, sessionID, args, updater, message) {
  const target = String(args || "").trim() || "all"
  const state = await readState(directory, sessionID)
  let count = 0
  state.jobs = (state.jobs || []).map((job, index) => {
    if (matchJob(job, target, index)) {
      count++
      return updater(job)
    }
    return job
  })
  await writeState(directory, sessionID, state)
  await toast(client, `${message}: ${count} loop(s).`, count ? "success" : "warning")
}

async function statusLoop(directory, client, sessionID) {
  const state = await readState(directory, sessionID)
  const jobs = state.jobs || []
  const lines = jobs.length
    ? jobs.map((job, index) => {
        const dueIn = Math.max(0, job.intervalMs - (now() - (job.lastRunAt || 0)))
        const flags = [
          job.paused ? "paused" : "active",
          job.safe ? "safe" : undefined,
          job.askNever ? "ask-never" : undefined,
          job.noOverlap ? "no-overlap" : undefined,
          job.checkpointOnly ? "checkpoint-only" : undefined,
          job.gitCheckpoint ? "git-checkpoint" : undefined,
        ].filter(Boolean).join(",")
        return `${index + 1}. ${job.id}${job.name ? ` (${job.name})` : ""}: ${jobLabel(job)} | runs=${job.runCount || 0} | due in ${durationToText(dueIn)} | ${flags}`
      })
    : ["No active loop jobs."]

  const message = lines.join("\n")
  await toast(client, jobs.length ? `${jobs.length} loop job(s). Check chat/logs for details.` : "No active loop jobs.", jobs.length ? "info" : "warning")
  await log(client, "info", "Loop status", { sessionID, status: message })

  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: `OpenCode loop status:\n${message}` }],
      },
    })
  } catch {}
}

async function helpLoop(client, sessionID) {
  const text = [
    "OpenCode Loop help:",
    "/loop 0s <prompt>                         Claude Code style auto-continue on every idle",
    "/loop 5m --ask-never --safe <prompt>       interval loop for autonomous development",
    "/loop 200m --no-now /compact               compact/summarize loop",
    "/loop 10m !npm test                        shell command loop",
    "/loop 0s --verify \"npm test\" <prompt>      run verification after each turn",
    "/loop 0s --preflight \"npm install\" <prompt> run a command before each turn",
    "/loop 0s --stop-file STOP_LOOP <prompt>     stop when a file appears",
    "/loop 0s --progress-file progress.md <prompt>",
    "/loop-status | /loop-now | /loop-pause | /loop-resume | /loop-stop | /loop-logs",
  ].join("\n")
  try {
    await client.session.prompt({ path: { id: sessionID }, body: { noReply: true, parts: [{ type: "text", text }] } })
  } catch {}
}

async function logsLoop(directory, client, sessionID) {
  let text = "No loop log found."
  try {
    const file = path.join(stateDir(directory), "loop.log")
    const data = await fs.readFile(file, "utf8")
    text = data.trim().split(/\r?\n/).slice(-60).join("\n") || text
  } catch {}
  try {
    await client.session.prompt({ path: { id: sessionID }, body: { noReply: true, parts: [{ type: "text", text: "OpenCode loop logs:\n" + text }] } })
  } catch {}
}

async function runNow(directory, client, sessionID, args) {
  const target = String(args || "").trim() || "all"
  const state = await readState(directory, sessionID)
  const jobs = state.jobs || []
  let count = 0
  for (const [index, job] of jobs.entries()) {
    if (matchJob(job, target, index)) {
      job.lastRunAt = 0
      job.paused = false
      count++
    }
  }
  await writeState(directory, sessionID, state)
  await toast(client, `Marked ${count} loop job(s) due now.`, count ? "success" : "warning")
  await maybeRunDueJobs(directory, client, sessionID, { force: true })
}

async function handleCommand(directory, client, input, fallbackName, fallbackArgs) {
  const name = input?.command ?? input?.name ?? fallbackName
  const sessionID = input?.sessionID
  const args = input?.arguments ?? fallbackArgs ?? ""
  if (!sessionID || !name) return false

  if (wasHandled(sessionID, name, args)) return true

  if (isLoop(name)) {
    markHandled(sessionID, name, args)
    await addLoop(directory, client, sessionID, args)
    return true
  }
  if (isPreset(name)) {
    markHandled(sessionID, name, args)
    await addLoop(directory, client, sessionID, args, presetDefaults(name, args))
    return true
  }
  if (isLoopStop(name) || isLoopRemove(name)) {
    markHandled(sessionID, name, args)
    await stopLoop(directory, client, sessionID, args)
    return true
  }
  if (isLoopStatus(name)) {
    markHandled(sessionID, name, args)
    await statusLoop(directory, client, sessionID)
    return true
  }
  if (isLoopNow(name)) {
    markHandled(sessionID, name, args)
    await runNow(directory, client, sessionID, args)
    return true
  }
  if (isLoopPause(name)) {
    markHandled(sessionID, name, args)
    await updateJobState(directory, client, sessionID, args, (job) => ({ ...job, paused: true }), "Paused")
    return true
  }
  if (isLoopResume(name)) {
    markHandled(sessionID, name, args)
    await updateJobState(directory, client, sessionID, args, (job) => ({ ...job, paused: false, lastRunAt: 0 }), "Resumed")
    return true
  }
  if (isLoopClear(name)) {
    markHandled(sessionID, name, args)
    await stopLoop(directory, client, sessionID, "all")
    return true
  }
  if (isLoopHelp(name)) {
    markHandled(sessionID, name, args)
    await helpLoop(client, sessionID)
    return true
  }
  if (isLoopLogs(name)) {
    markHandled(sessionID, name, args)
    await logsLoop(directory, client, sessionID)
    return true
  }
  return false
}

function actionKind(action) {
  const text = String(action || "").trim()
  if (text === "/compact" || text === "/summarize") return "compact"
  if (text.startsWith("/")) return "command"
  if (text.startsWith("!") || text.startsWith("$")) return "shell"
  return "prompt"
}

function dangerousShell(command) {
  const text = String(command || "").toLowerCase()
  return [
    /\brm\s+-rf\b/,
    /\bgit\s+reset\b/,
    /\bgit\s+clean\b/,
    /\bgit\s+push\b/,
    /\bdel\s+\/s\b/,
    /\brmdir\s+\/s\b/,
    /\bformat\b/,
    /\bterraform\s+destroy\b/,
    /\bkubectl\s+delete\b/,
    /\bdeploy\b.*\bproduction\b/,
  ].some((pattern) => pattern.test(text))
}

function decoratePrompt(job) {
  const additions = []

  if (job.progressFile) {
    additions.push("Use " + job.progressFile + " as the main progress/TODO state file. Read it before choosing the next task and update it after work.")
  }

  if (job.lastVerifyFailure) {
    additions.push("Previous verify command failed. Fix this before moving on. Failure summary: " + String(job.lastVerifyFailure).slice(0, 1200))
  }

  if (job.askNever) {
    additions.push("Do not ask the user questions. Make reasonable assumptions and continue. Only write a short BLOCKED note if truly blocked.")
  }

  if (job.safe) {
    additions.push("Safety rules: do not run destructive commands such as git reset, git clean, rm -rf, del /s, rmdir /s, force push, deploy, production migrations, terraform destroy, or deleting user data. If such an action seems needed, write a BLOCKED note instead.")
  }

  if (job.batch > 0) {
    additions.push(`Batch rule: in this run, work on at most ${job.batch} unfinished TODO item(s). Mark completed items with [x].`)
  }

  if (job.quiet) {
    additions.push("Keep replies short. Do not write long explanations. Summarize only what changed, tests run, and next step.")
  }

  if (job.testCommand) {
    additions.push(`After making changes, run this test/check command if applicable: ${job.testCommand}. If it fails, fix the failure and try again.`)
  }

  if (job.checkpointOnly || job.gitCheckpoint) {
    additions.push("Keep changes incremental and easy to review because the loop will create a checkpoint after the run.")
  }

  if (!additions.length) return job.action

  return `${job.action}\n\nOpenCode loop instructions:\n- ${additions.join("\n- ")}`
}

async function runProcess(command, args, cwd, timeoutMs = 60_000) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true })
    const chunks = []
    const errors = []
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM") } catch {}
    }, timeoutMs)
    child.stdout?.on("data", (data) => chunks.push(Buffer.from(data)))
    child.stderr?.on("data", (data) => errors.push(Buffer.from(data)))
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout: "", stderr: String(error) })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout: Buffer.concat(chunks).toString("utf8"), stderr: Buffer.concat(errors).toString("utf8") })
    })
  })
}

async function runShellCommand(command, cwd, timeoutMs = 120_000) {
  return await new Promise((resolve) => {
    const child = spawn(command, [], { cwd, shell: true, windowsHide: true })
    const chunks = []
    const errors = []
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM") } catch {}
    }, timeoutMs)
    child.stdout?.on("data", (data) => chunks.push(Buffer.from(data)))
    child.stderr?.on("data", (data) => errors.push(Buffer.from(data)))
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout: "", stderr: String(error) })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout: Buffer.concat(chunks).toString("utf8"), stderr: Buffer.concat(errors).toString("utf8") })
    })
  })
}

async function appendLoopLog(directory, line, extra = {}) {
  try {
    await ensureDir(stateDir(directory))
    const payload = { time: new Date().toISOString(), line, ...extra }
    await fs.appendFile(path.join(stateDir(directory), "loop.log"), JSON.stringify(payload) + "\n")
  } catch {}
}

async function ensureBranch(directory, job, client, sessionID) {
  if (!job.branch || job.branchDone) return job
  const branch = safeID(job.branch)
  const check = await runProcess("git", ["rev-parse", "--is-inside-work-tree"], directory, 10_000)
  if (check.code !== 0) {
    await log(client, "warn", "Branch requested outside git repo", { sessionID, branch })
    job.branchDone = true
    return job
  }

  let result = await runProcess("git", ["switch", branch], directory, 30_000)
  if (result.code !== 0) {
    result = await runProcess("git", ["switch", "-c", branch], directory, 30_000)
  }
  job.branchDone = true
  await log(client, result.code === 0 ? "info" : "warn", "Branch setup finished", { sessionID, branch, code: result.code, stderr: result.stderr })
  await toast(client, result.code === 0 ? `Loop branch active: ${branch}` : `Could not switch/create branch: ${branch}`, result.code === 0 ? "success" : "warning")
  return job
}

async function maybeCompact(client, sessionID, job) {
  const dueByRuns = job.compactEveryRuns > 0 && (job.runCount || 0) > 0 && (job.runCount || 0) % job.compactEveryRuns === 0 && job.lastCompactRunCount !== job.runCount
  const dueByTime = job.compactEveryMs > 0 && (!job.lastCompactAt || now() - job.lastCompactAt >= job.compactEveryMs)
  if (!dueByRuns && !dueByTime) return job

  try {
    await client.session.summarize({ path: { id: sessionID }, body: {} })
    job.lastCompactAt = now()
    job.lastCompactRunCount = job.runCount || 0
  } catch {}
  return job
}

async function fireAction(directory, client, sessionID, job) {
  const action = String(job.action || "").trim()
  const kind = actionKind(action)

  if (kind === "compact") {
    await client.session.summarize({ path: { id: sessionID }, body: {} })
    return { startsAssistantTurn: false }
  }

  if (kind === "command") {
    const [command, argumentsText] = splitFirst(action.slice(1))
    client.session.command({ path: { id: sessionID }, body: { command, arguments: argumentsText } }).catch(() => {})
    return { startsAssistantTurn: true }
  }

  if (kind === "shell") {
    const command = action.slice(1).trim()
    if (job.safe && dangerousShell(command)) {
      await toast(client, `Blocked dangerous shell command in safe mode: ${command}`, "error")
      await log(client, "warn", "Blocked dangerous shell command", { sessionID, command })
      return { startsAssistantTurn: false }
    }
    client.session.shell({ path: { id: sessionID }, body: { command } }).catch(() => {})
    return { startsAssistantTurn: true }
  }

  client.session.prompt({
    path: { id: sessionID },
    body: {
      parts: [
        {
          type: "text",
          text: `OpenCode loop continuation. Continue autonomously like Claude Code loop mode.\n\n${decoratePrompt(job)}`,
        },
      ],
    },
  }).catch(() => {})
  return { startsAssistantTurn: true }
}

async function snapshotPaths(directory, files) {
  const snapshot = {}
  for (const file of files || []) {
    const fullPath = path.resolve(directory, file)
    try {
      const stat = await fs.stat(fullPath)
      snapshot[file] = `${stat.mtimeMs}:${stat.size}`
    } catch {
      snapshot[file] = "missing"
    }
  }
  return snapshot
}

async function watchChanged(directory, job) {
  if (!job.watchPaths?.length) return false
  const next = await snapshotPaths(directory, job.watchPaths)
  const previous = job.watchSnapshot || {}
  const changed = job.watchPaths.some((file) => previous[file] !== next[file])
  if (changed) job.watchSnapshot = next
  return changed
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function fileContains(filePath, needle) {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > MAX_WALK_BYTES) return false
    const text = await fs.readFile(filePath, "utf8")
    return text.includes(needle)
  } catch {
    return false
  }
}

async function untilReached(directory, job) {
  if (!job.until) return false
  const needle = String(job.until)
  const directFiles = [
    "progress.md",
    "PROGRESS.md",
    "todo.md",
    "TODO.md",
    "todolist.md",
    "TODOLIST.md",
    path.join(".opencode", "opencode-loop", "until.txt"),
  ]

  for (const item of directFiles) {
    if (await fileContains(path.resolve(directory, item), needle)) return true
  }

  let scanned = 0
  async function walk(current) {
    if (scanned >= MAX_WALK_FILES) return false
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      if (scanned >= MAX_WALK_FILES) return false
      if ([".git", "node_modules", "dist", "build", ".next", "coverage"].includes(entry.name)) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (await walk(fullPath)) return true
      } else if (/\.(md|txt|json|yaml|yml)$/i.test(entry.name)) {
        scanned++
        if (await fileContains(fullPath, needle)) return true
      }
    }
    return false
  }

  return await walk(directory)
}

async function stopFileReached(directory, job) {
  if (!job.stopFile) return false
  return await pathExists(path.resolve(directory, job.stopFile))
}

async function createCheckpoint(directory, sessionID, job, client) {
  if (!job.checkpointOnly && !job.gitCheckpoint) return

  const inRepo = await runProcess("git", ["rev-parse", "--is-inside-work-tree"], directory, 10_000)
  if (inRepo.code !== 0) return

  const status = await runProcess("git", ["status", "--short"], directory, 30_000)
  if (!status.stdout.trim()) return

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const checkpointDir = path.join(stateDir(directory), "checkpoints", safeID(sessionID))
  await ensureDir(checkpointDir)

  const diff = await runProcess("git", ["diff", "--binary"], directory, 120_000)
  const staged = await runProcess("git", ["diff", "--cached", "--binary"], directory, 120_000)
  const prefix = `${timestamp}-${safeID(job.name || job.id)}`
  await fs.writeFile(path.join(checkpointDir, `${prefix}.status.txt`), status.stdout + status.stderr)
  await fs.writeFile(path.join(checkpointDir, `${prefix}.patch`), `${diff.stdout}\n${staged.stdout}`)

  if (job.gitCheckpoint) {
    await runProcess("git", ["add", "-A"], directory, 120_000)
    const commit = await runProcess("git", ["commit", "-m", `chore: opencode loop checkpoint ${timestamp}`], directory, 120_000)
    await log(client, commit.code === 0 ? "info" : "warn", "Git checkpoint commit finished", { sessionID, code: commit.code, stdout: commit.stdout, stderr: commit.stderr })
  }

  await toast(client, `Loop checkpoint saved: ${prefix}`, "success")
}

function dueJobs(state, force = false) {
  const current = now()
  return (state.jobs || []).filter((job) => {
    if (!job.enabled || job.paused) return false
    if (job.maxRuns > 0 && (job.runCount || 0) >= job.maxRuns) return false
    if (force) return true
    if (job.watchPaths?.length) return false
    return job.intervalMs === 0 || !job.lastRunAt || current - job.lastRunAt >= job.intervalMs
  })
}

function clearActiveRun(sessionID) {
  const active = activeRuns.get(sessionID)
  if (active?.timer) clearTimeout(active.timer)
  activeRuns.delete(sessionID)
}

async function finalizeActiveRun(directory, client, sessionID) {
  const active = activeRuns.get(sessionID)
  if (!active) return

  clearActiveRun(sessionID)

  const state = await readState(directory, sessionID)
  const job = (state.jobs || []).find((candidate) => candidate.id === active.jobId)
  if (!job) return

  job.lastFinishedAt = now()

  if (job.verifyCommand) {
    const verify = await runShellCommand(job.verifyCommand, directory, job.timeoutMs || 300_000)
    job.lastVerifyAt = now()
    job.lastVerifyCode = verify.code
    if (verify.code === 0) {
      job.lastVerifyFailure = ""
      await toast(client, "Loop verify passed: " + job.verifyCommand, "success")
    } else {
      job.lastVerifyFailure = (job.verifyCommand + "\nexit=" + verify.code + "\n" + verify.stdout + "\n" + verify.stderr).slice(0, 4000)
      await toast(client, "Loop verify failed: " + job.verifyCommand, "warning")
    }
    await appendLoopLog(directory, "verify", { sessionID, job: job.name || job.id, command: job.verifyCommand, code: verify.code })
  }

  await writeState(directory, sessionID, state)
  await createCheckpoint(directory, sessionID, job, client)
}

async function maybeRunDueJobs(directory, client, sessionID, options = {}) {
  const active = activeRuns.get(sessionID)
  if (active && active.job?.noOverlap !== false && now() - active.startedAt < (active.job?.timeoutMs || DEFAULT_ACTIVE_GUARD_MS)) return

  let state = await readState(directory, sessionID)

  for (const job of state.jobs || []) {
    if (job.watchPaths?.length && !job.paused && job.enabled) {
      if (await watchChanged(directory, job)) {
        job.lastRunAt = 0
      }
    }
  }

  let due = dueJobs(state, options.force)
  if (!due.length) {
    await writeState(directory, sessionID, state)
    return
  }

  let job = due[0]

  if (await stopFileReached(directory, job)) {
    job.enabled = false
    state.jobs = (state.jobs || []).filter((candidate) => candidate.id !== job.id)
    await writeState(directory, sessionID, state)
    await toast(client, "Loop stopped by --stop-file: " + job.stopFile, "success")
    await appendLoopLog(directory, "stop-file", { sessionID, job: job.name || job.id, stopFile: job.stopFile })
    return
  }

  if (await untilReached(directory, job)) {
    job.enabled = false
    state.jobs = (state.jobs || []).filter((candidate) => candidate.enabled !== false)
    await writeState(directory, sessionID, state)
    await toast(client, `Loop stopped by --until: ${job.until}`, "success")
    return
  }

  if (job.preflightCommand) {
    if (job.safe && dangerousShell(job.preflightCommand)) {
      job.paused = true
      await writeState(directory, sessionID, state)
      await toast(client, "Preflight blocked in safe mode and loop paused: " + job.preflightCommand, "error")
      return
    }
    const preflight = await runShellCommand(job.preflightCommand, directory, job.timeoutMs || 300_000)
    await appendLoopLog(directory, "preflight", { sessionID, job: job.name || job.id, command: job.preflightCommand, code: preflight.code })
    if (preflight.code !== 0) {
      job.paused = true
      job.lastPreflightFailure = (job.preflightCommand + "\nexit=" + preflight.code + "\n" + preflight.stdout + "\n" + preflight.stderr).slice(0, 4000)
      state.jobs = (state.jobs || []).map((candidate) => candidate.id === job.id ? job : candidate)
      await writeState(directory, sessionID, state)
      await toast(client, "Preflight failed and loop paused: " + job.preflightCommand, "warning")
      return
    }
  }

  job = await ensureBranch(directory, job, client, sessionID)
  job = await maybeCompact(client, sessionID, job)

  job.lastRunAt = now()
  job.runCount = (job.runCount || 0) + 1

  if (job.maxRuns > 0 && job.runCount >= job.maxRuns) {
    job.enabled = false
  }

  state.jobs = (state.jobs || []).map((candidate) => candidate.id === job.id ? job : candidate).filter((candidate) => candidate.enabled !== false)
  await writeState(directory, sessionID, state)

  await log(client, "info", "Running loop job", { sessionID, job })
  await appendLoopLog(directory, "run", { sessionID, job: job.name || job.id, runCount: job.runCount })
  await toast(client, `Loop running: ${job.name || job.id}`, "info")

  try {
    const result = await fireAction(directory, client, sessionID, job)
    if (result.startsAssistantTurn) {
      let timer
      if (job.timeoutMs > 0) {
        timer = setTimeout(() => {
          client.session.abort?.({ path: { id: sessionID }, body: {} }).catch(() => {})
          toast(client, `Loop timeout fired: ${job.name || job.id}`, "warning").catch(() => {})
        }, job.timeoutMs)
      }
      activeRuns.set(sessionID, { jobId: job.id, job, startedAt: now(), timer })
    }
  } catch (error) {
    await log(client, "error", "Loop job failed", {
      sessionID,
      job,
      error: error instanceof Error ? error.message : String(error),
    })
    await toast(client, `Loop job failed: ${error instanceof Error ? error.message : String(error)}`, "error")
    clearActiveRun(sessionID)
  }
}

export const OpenCodeLoopPlugin = async ({ client, directory }) => {
  await log(client, "info", "Plugin initialized", { directory })

  return {
    "command.execute.before": async (input) => {
      await handleCommand(directory, client, input)
    },

    event: async ({ event }) => {
      if (event.type === "command.executed") {
        const props = event.properties || {}
        await handleCommand(directory, client, props, props.name, props.arguments)
      }

      const idleSessionID = getIdleSessionID(event)
      if (idleSessionID) {
        await finalizeActiveRun(directory, client, idleSessionID)
        await maybeRunDueJobs(directory, client, idleSessionID)
      }
    },
  }
}

export default OpenCodeLoopPlugin
