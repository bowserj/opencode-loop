const SERVICE = "bybrawe-opencode-loop"
const STATE_DIR = ".opencode/bybrawe-loop"
const GUARD_TIMEOUT_MS = 60_000

const guards = new Map()
const handled = new Map()

function now() {
  return Date.now()
}

function durationToText(ms) {
  if (ms === 0) return "every idle"
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  if (ms % 1_000 === 0) return `${ms / 1_000}s`
  return `${ms}ms`
}

function parseDuration(value) {
  const match = String(value || "").trim().match(/^(\d+)\s*(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i)
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

function takeFlag(rest, flag) {
  const pattern = new RegExp(`(^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?=\\s|$)`, "i")
  const found = pattern.test(rest)
  return [found, rest.replace(pattern, " ").replace(/\s+/g, " ").trim()]
}

function takeFlagValue(rest, flag) {
  const pattern = new RegExp(`(^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s+(?:\"([^\"]*)\"|'([^']*)'|(\\S+))`, "i")
  const match = rest.match(pattern)
  if (!match) return [undefined, rest]
  const value = match[2] ?? match[3] ?? match[4]
  return [value, rest.replace(pattern, " ").replace(/\s+/g, " ").trim()]
}

function parseLoopArgs(raw) {
  const [durationText, remaining] = splitFirst(raw)
  const intervalMs = parseDuration(durationText)
  if (intervalMs === null) {
    return {
      ok: false,
      error: "Usage: /loop 0s <prompt> | /loop 5m <prompt> | /loop 200m /compact | /loop 10m !npm test",
    }
  }

  let rest = remaining
  let immediate = true
  let maxRuns = 0
  let name

  let found
  ;[found, rest] = takeFlag(rest, "--no-now")
  if (found) immediate = false

  ;[found, rest] = takeFlag(rest, "--now")
  if (found) immediate = true

  let value
  ;[value, rest] = takeFlagValue(rest, "--max-runs")
  if (value !== undefined) {
    const parsed = Number.parseInt(value, 10)
    maxRuns = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }

  ;[value, rest] = takeFlagValue(rest, "--name")
  if (value !== undefined) {
    name = value.trim()
  }

  const action = stripOuterQuotes(rest)
  if (!action) {
    return {
      ok: false,
      error: "Missing action. Example: /loop 0s progress.md'ye göre devam et",
    }
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
      createdAt: new Date().toISOString(),
      enabled: true,
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

function getBusySessionID(event) {
  const sessionID = event?.properties?.sessionID
  const status = event?.properties?.status
  if (
    event?.type === "session.status" &&
    typeof sessionID === "string" &&
    status &&
    typeof status === "object" &&
    status.type === "busy"
  ) {
    return sessionID
  }
  return undefined
}

function stateDir(directory) {
  return `${directory}/${STATE_DIR}`
}

function statePath(directory, sessionID) {
  return `${stateDir(directory)}/${sessionID}.json`
}

async function ensureStateDir(directory) {
  await Bun.$`mkdir -p ${stateDir(directory)}`.quiet()
}

async function readState(directory, sessionID) {
  const path = statePath(directory, sessionID)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return { version: 1, jobs: [] }
  }

  try {
    const parsed = JSON.parse(await file.text())
    return {
      version: 1,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    }
  } catch {
    return { version: 1, jobs: [] }
  }
}

async function writeState(directory, sessionID, state) {
  await ensureStateDir(directory)
  await Bun.write(statePath(directory, sessionID), JSON.stringify(state, null, 2))
}

async function removeState(directory, sessionID) {
  try {
    await Bun.file(statePath(directory, sessionID)).delete()
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

function jobLabel(job) {
  const title = job.name ? `${job.name}: ` : ""
  const limit = job.maxRuns > 0 ? `, max ${job.maxRuns}` : ""
  return `${title}${durationToText(job.intervalMs)} -> ${job.action}${limit}`
}

async function addLoop(directory, client, sessionID, args) {
  const parsed = parseLoopArgs(args)
  if (!parsed.ok) {
    await toast(client, parsed.error, "warning")
    await log(client, "warn", "Invalid loop command", { sessionID, args, error: parsed.error })
    return
  }

  const state = await readState(directory, sessionID)
  state.jobs.push(parsed.job)
  await writeState(directory, sessionID, state)

  await toast(client, `Loop added: ${jobLabel(parsed.job)}`, "success")
  await log(client, "info", "Loop added", { sessionID, job: parsed.job })
}

async function stopLoop(directory, client, sessionID, args) {
  const target = String(args || "").trim()
  if (!target || target.toLowerCase() === "all") {
    await removeState(directory, sessionID)
    await toast(client, "All loops stopped for this session.", "success")
    await log(client, "info", "All loops stopped", { sessionID })
    return
  }

  const state = await readState(directory, sessionID)
  const before = state.jobs.length
  state.jobs = state.jobs.filter((job) => job.id !== target && job.name !== target)
  await writeState(directory, sessionID, state)
  await toast(client, `Stopped ${before - state.jobs.length} loop(s).`, "success")
}

async function statusLoop(directory, client, sessionID) {
  const state = await readState(directory, sessionID)
  const jobs = state.jobs || []
  const lines = jobs.length
    ? jobs.map((job, index) => {
        const dueIn = Math.max(0, job.intervalMs - (now() - (job.lastRunAt || 0)))
        return `${index + 1}. ${job.id}${job.name ? ` (${job.name})` : ""}: ${jobLabel(job)} | runs=${job.runCount || 0} | due in ${durationToText(dueIn)}`
      })
    : ["No active loop jobs."]

  const message = lines.join("\n")
  await toast(client, jobs.length ? `${jobs.length} loop job(s). Check logs for details.` : "No active loop jobs.", jobs.length ? "info" : "warning")
  await log(client, "info", "Loop status", { sessionID, status: message })

  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: `Bybrawe loop status:\n${message}` }],
      },
    })
  } catch {}
}

async function runNow(directory, client, sessionID, args) {
  const target = String(args || "").trim()
  const state = await readState(directory, sessionID)
  const jobs = state.jobs || []
  const candidates = !target || target.toLowerCase() === "all" ? jobs : jobs.filter((job) => job.id === target || job.name === target)
  if (!candidates.length) {
    await toast(client, "No matching loop job to run now.", "warning")
    return
  }
  for (const job of candidates) job.lastRunAt = 0
  await writeState(directory, sessionID, state)
  await toast(client, `Marked ${candidates.length} loop job(s) due now.`, "success")
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
  if (isLoopStop(name)) {
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
  return false
}

function actionKind(action) {
  const text = String(action || "").trim()
  if (text === "/compact" || text === "/summarize") return "compact"
  if (text.startsWith("/")) return "command"
  if (text.startsWith("!") || text.startsWith("$")) return "shell"
  return "prompt"
}

async function fireAction(client, sessionID, job) {
  const action = String(job.action || "").trim()
  const kind = actionKind(action)

  if (kind === "compact") {
    await client.session.summarize({ path: { id: sessionID }, body: {} })
    return { startsAssistantTurn: false }
  }

  if (kind === "command") {
    const [command, argumentsText] = splitFirst(action.slice(1))
    client.session
      .command({ path: { id: sessionID }, body: { command, arguments: argumentsText } })
      .catch(() => {})
    return { startsAssistantTurn: true }
  }

  if (kind === "shell") {
    const command = action.slice(1).trim()
    client.session.shell({ path: { id: sessionID }, body: { command } }).catch(() => {})
    return { startsAssistantTurn: true }
  }

  client.session
    .prompt({
      path: { id: sessionID },
      body: {
        parts: [
          {
            type: "text",
            text: `Bybrawe loop continuation. Continue autonomously.\n\n${action}`,
          },
        ],
      },
    })
    .catch(() => {})
  return { startsAssistantTurn: true }
}

function dueJobs(state, force = false) {
  const current = now()
  return (state.jobs || []).filter((job) => {
    if (!job.enabled) return false
    if (job.maxRuns > 0 && (job.runCount || 0) >= job.maxRuns) return false
    if (force) return true
    return job.intervalMs === 0 || !job.lastRunAt || current - job.lastRunAt >= job.intervalMs
  })
}

async function maybeRunDueJobs(directory, client, sessionID, options = {}) {
  const guard = guards.get(sessionID)
  if (guard?.active && now() - guard.startedAt < GUARD_TIMEOUT_MS) return

  const state = await readState(directory, sessionID)
  const due = dueJobs(state, options.force)
  if (!due.length) return

  const job = due[0]
  job.lastRunAt = now()
  job.runCount = (job.runCount || 0) + 1

  if (job.maxRuns > 0 && job.runCount >= job.maxRuns) {
    job.enabled = false
  }

  state.jobs = (state.jobs || []).filter((candidate) => candidate.enabled !== false)
  await writeState(directory, sessionID, state)

  await log(client, "info", "Running loop job", { sessionID, job })
  await toast(client, `Loop running: ${job.name || job.id}`, "info")

  try {
    const result = await fireAction(client, sessionID, job)
    if (result.startsAssistantTurn) {
      guards.set(sessionID, { active: true, startedAt: now() })
    }
  } catch (error) {
    await log(client, "error", "Loop job failed", {
      sessionID,
      job,
      error: error instanceof Error ? error.message : String(error),
    })
    await toast(client, `Loop job failed: ${error instanceof Error ? error.message : String(error)}`, "error")
    guards.delete(sessionID)
  }
}

export const BybraweLoopPlugin = async ({ client, directory }) => {
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

      const busySessionID = getBusySessionID(event)
      if (busySessionID) {
        guards.delete(busySessionID)
        return
      }

      const idleSessionID = getIdleSessionID(event)
      if (idleSessionID) {
        await maybeRunDueJobs(directory, client, idleSessionID)
      }
    },
  }
}

export default BybraweLoopPlugin
