# OpenCode Loop - Claude Code Style Auto-Continue for OpenCode

**OpenCode Loop** adds a Claude Code style `/loop` command to OpenCode. It automatically continues an OpenCode agent after each idle turn, can run `/compact` on a schedule, can follow `progress.md`, process large TODO lists, run tests, save checkpoints, and keep development moving without typing “continue” again and again.

This plugin is built for people searching for:

- OpenCode loop
- OpenCode Claude Code loop
- OpenCode auto continue
- OpenCode continue automatically
- OpenCode `/loop` command
- OpenCode compact scheduler
- OpenCode Ralph loop alternative
- Claude Code style loop for OpenCode
- autonomous coding loop for OpenCode
- progress.md TODO automation for OpenCode

## Features

- **Claude Code style auto-continue**: `/loop 0s ...` runs again whenever OpenCode becomes idle.
- **Interval loops**: run prompts, slash commands, or shell commands every `5m`, `30m`, `1h`, etc.
- **Compact scheduling**: run `/compact` or `/summarize` every N minutes or every N runs.
- **progress.md workflow**: keep a project moving from `progress.md`, `TODO.md`, or your own state file.
- **Large TODO support**: use `--batch` so each run handles only a safe number of tasks.
- **Verification loops**: use `--verify "npm test"`, `--verify "pnpm test"`, `--verify "pytest"`, etc.
- **Preflight commands**: run setup checks before each loop with `--preflight`.
- **Checkpoints**: save patch snapshots with `--checkpoint-only` or create git commits with `--git-checkpoint`.
- **Stop controls**: pause, resume, remove, run now, clear, or stop by creating a stop file.
- **Safety helpers**: `--safe`, `--ask-never`, `--no-overlap`, and permission-friendly workflows.
- **Watch mode**: trigger when files like `progress.md` change.

## Quick examples

```text
/loop 0s continue from progress.md and implement the next unfinished TODO
/loop 0s --ask-never --safe --batch 5 --checkpoint-only follow progress.md, complete TODOs in order, and mark finished items with [x]
/loop 200m --no-now /compact
/loop 10m !npm test
/loop 0s --verify "npm test" continue from progress.md, fix failing tests, and update the TODO list
/loop-safe-dev 0s
/loop-status
/loop-logs
/loop-stop all
```

`0s` is the closest behavior to a **Claude Code CLI loop / auto-continue workflow**. Every time OpenCode becomes idle, the loop can immediately send the next instruction.

## Installation

### From this repository

Clone or download the repository, then run the installer.

#### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

#### macOS / Linux / Git Bash

```bash
chmod +x ./scripts/install.sh
./scripts/install.sh
```

Restart OpenCode after installation.

### As an OpenCode plugin package

Add the package to your OpenCode config when using a package-based install:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-loop-like-claude"]
}
```

For local development, the install scripts copy `src/index.js` into the OpenCode plugin directory and the command markdown files into the OpenCode commands directory.

## Core commands

| Command | Purpose |
|---|---|
| `/loop <interval> <action>` | Add an idle/interval loop job |
| `/loop-help` | Show usage help inside OpenCode |
| `/loop-status` | Show active loop jobs |
| `/loop-logs` | Show recent loop log entries |
| `/loop-now [id/name/number/all]` | Run loop job(s) immediately |
| `/loop-pause [id/name/number/all]` | Pause loop job(s) |
| `/loop-resume [id/name/number/all]` | Resume loop job(s) |
| `/loop-remove [id/name/number/all]` | Remove loop job(s) |
| `/loop-stop [id/name/number/all]` | Alias for remove/stop |
| `/loop-clear` | Remove all loop jobs for the current session |

## Preset commands

| Command | Purpose |
|---|---|
| `/loop-dev 0s` | General autonomous OpenCode development loop |
| `/loop-progress 0s` | Follow `progress.md` and TODOs |
| `/loop-safe-dev 0s` | Safe dev loop with ask-never, batch 5 and patch checkpoints |
| `/loop-testfix 0s "npm test"` | Run, fix and re-run tests |
| `/loop-compact 200m` | Compact loop shortcut |

## Intervals

```text
0s     every idle event, like Claude Code auto-continue
5m     every 5 minutes when idle
200m   every 200 minutes when idle
1h     every hour when idle
```

The plugin is **idle-driven**. It checks jobs when OpenCode becomes idle, so it avoids intentionally starting a second agent turn on top of an active one.

## Actions

### Prompt action

```text
/loop 0s continue from progress.md. Work on the next unfinished TODO. Mark completed items with [x].
```

### Slash command action

```text
/loop 200m /compact
/loop 15m /review current changes
```

`/compact` and `/summarize` map to OpenCode session summarization.

### Shell action

```text
/loop 10m !npm test
/loop 30m $pnpm lint
```

Shell actions starting with `!` or `$` run through the OpenCode shell tool.

## Flags

### `--name <name>`

Name a loop so you can manage it later.

```text
/loop 0s --name dev continue from progress.md
/loop-pause dev
/loop-resume dev
/loop-stop dev
```

### `--max-runs <n>`

Stop after N runs.

```text
/loop 5m --max-runs 20 continue from progress.md
```

### `--timeout <duration>`

Best-effort abort after a timeout.

```text
/loop 0s --timeout 30m continue from progress.md
```

### `--until <text>`

Stop when a marker appears in common state files such as `progress.md`, `TODO.md`, or `.opencode/opencode-loop/until.txt`.

```text
/loop 5m --until ALL_DONE continue from progress.md
```

### `--stop-file <file>`

Stop when a file appears. This is a simple manual kill switch.

```text
/loop 0s --stop-file STOP_LOOP continue from progress.md
```

Create `STOP_LOOP` in the project root to stop that job.

### `--no-overlap` and `--allow-overlap`

`--no-overlap` is the default. It prevents a new run from being triggered while a previous run is still considered active.

```text
/loop 5m --no-overlap continue from progress.md
```

### `--compact-every <n|duration>`

Compact before a run every N runs or every duration.

```text
/loop 0s --compact-every 20 continue from progress.md
/loop 0s --compact-every 200m continue from progress.md
```

### `--test "<command>"`

Adds a test instruction to prompt actions.

```text
/loop 0s --test "npm test" continue from progress.md
```

### `--verify "<command>"`

Runs a real shell verification command after each assistant turn. If it fails, the next loop prompt includes the failure summary so the agent can fix it.

```text
/loop 0s --verify "npm test" continue from progress.md and fix any failing tests
```

### `--preflight "<command>"`

Runs a real shell command before each loop turn. If it fails, the loop pauses.

```text
/loop 0s --preflight "npm install" continue from progress.md
```

### `--checkpoint-only`

Save `git status` and `git diff --binary` snapshots under:

```text
.opencode/opencode-loop/checkpoints/<session>/
```

### `--git-checkpoint`

Save a patch checkpoint and attempt to commit all changes after each completed run.

```text
/loop 0s --git-checkpoint continue from progress.md
```

Use carefully. It runs `git add -A` and `git commit` when changes exist.

### `--branch <name>`

Switch to a branch before the first run, or create it if it does not exist.

```text
/loop 0s --branch ai-loop continue from progress.md
```

### `--safe`

Adds safety instructions to prompt actions and blocks obviously destructive shell actions.

```text
/loop 0s --safe continue from progress.md
```

Safe mode warns against or blocks patterns such as `git reset`, `git clean`, `rm -rf`, `git push`, `terraform destroy`, destructive delete commands and production deploys.

### `--batch <n>`

Tell the agent to process at most N TODO items per run.

```text
/loop 0s --batch 5 continue from progress.md
```

### `--quiet`

Tell the agent to keep replies short.

```text
/loop 0s --quiet continue from progress.md
```

### `--ask-never`

Tell the agent not to ask questions and to make reasonable assumptions.

```text
/loop 0s --ask-never continue from progress.md
```

### `--progress-file <file>`

Tell the agent which state file to treat as the main progress/TODO source.

```text
/loop 0s --progress-file progress.md continue from the progress file
```

### `--watch <file>`

Run when watched file metadata changes. This is still checked on idle events.

```text
/loop --watch progress.md continue after progress.md changes
/loop 5m --watch progress.md continue when progress.md changes or the interval is due
```

You can pass multiple `--watch` flags.

### `--now` and `--no-now`

By default a new loop is due immediately. Use `--no-now` to wait for the first interval.

```text
/loop 200m --no-now /compact
```

## Recommended OpenCode loop recipes

### Claude Code style auto-continue loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --batch 5 --compact-every 200m --checkpoint-only --progress-file progress.md Treat progress.md as the main project state file. Continue with the next unfinished TODO, implement it, mark completed items with [x], add new useful TODOs when you discover them, run tests/lint/build when available, and keep going while work remains.
```

### Auto-fix tests loop

```text
/loop 0s --name testfix --ask-never --safe --verify "npm test" Continue from progress.md. If tests fail, analyze the failure, fix it, and run the tests again.
```

### Long-running autonomous development loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --compact-every 20 --timeout 45m --stop-file STOP_LOOP --checkpoint-only Continue from progress.md. Do not ask questions. Make reasonable assumptions. Complete TODOs in order, mark finished items with [x], add useful new ideas to progress.md, and keep going while work remains.
```

### Compact loop

```text
/loop 200m --name compact --no-now /compact
```

### Test shell loop

```text
/loop 10m --name tests --safe !npm test
```

### Watch `progress.md`

```text
/loop --watch progress.md --name watch-progress read progress.md and continue from the updated plan
```

## Suggested OpenCode permission config

Full `permission: "allow"` is convenient but risky. For safer long loops, keep destructive commands as ask/deny.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow",
    "grep": "allow",
    "glob": "allow",
    "todowrite": "allow",
    "edit": "allow",
    "bash": {
      "*": "ask",
      "git status*": "allow",
      "git diff*": "allow",
      "npm test*": "allow",
      "npm run test*": "allow",
      "npm run lint*": "allow",
      "pnpm test*": "allow",
      "pnpm lint*": "allow",
      "git push*": "ask",
      "git reset*": "ask",
      "git clean*": "deny",
      "rm *": "deny",
      "del *": "ask",
      "rmdir *": "ask"
    },
    "external_directory": "ask"
  }
}
```

## State files

Session loop state is stored under:

```text
.opencode/opencode-loop/
```

Patch checkpoints are stored under:

```text
.opencode/opencode-loop/checkpoints/
```

Recent plugin events are appended to:

```text
.opencode/opencode-loop/loop.log
```

## Example `progress.md`

```md
# Progress

## Current Goal
Improve the application in small safe steps.

## Agent Rules
- Do not ask questions unless truly blocked.
- Make reasonable assumptions and continue.
- Work on unfinished TODOs in order.
- Mark completed TODOs with [x].
- Add new bugs, ideas, or follow-up tasks as TODOs.
- Run tests/lint/build when available.
- Do not run destructive commands, force pushes, production deploys, or database resets.

## Active TODO
- [ ] Review the project structure and identify the next safe improvement.
- [ ] Fix the highest-priority failing test.
- [ ] Improve the user-facing error state in the main flow.

## Completed
- [x] Added initial project notes.

## Backlog Ideas
- [ ] Add a smoke test for the critical path.
- [ ] Improve developer setup documentation.

## Blocked
- None.
```

## Related searches

This project is useful for developers looking for an OpenCode loop, OpenCode auto-continue command, OpenCode Claude Code loop behavior, Claude Code style `/loop` for OpenCode, OpenCode compact scheduler, OpenCode Ralph loop alternative, autonomous coding agent loop, or progress.md TODO automation.

## Notes and limits

- The plugin is idle-driven. It does not run a background daemon while OpenCode is busy.
- `--timeout` is best-effort and relies on OpenCode's abort API.
- `--verify` and `--preflight` run shell commands, so configure OpenCode permissions carefully.
- `--until` scans common state files and a limited number of markdown/text/json/yaml files to avoid walking huge projects.
- `--safe` reduces risk but does not replace careful OpenCode permissions.
- If you want truly unattended multi-hour work, use a disposable branch or worktree and checkpoint patches.

## License

MIT
