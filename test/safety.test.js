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
