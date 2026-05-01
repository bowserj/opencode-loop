# OpenCode Loop

**Claude Code style auto-continue for OpenCode.**

OpenCode Loop adds a practical `/loop` command to OpenCode so an agent can keep working after each idle turn instead of waiting for you to type “continue” again. It is useful for long coding sessions, `progress.md` workflows, TODO automation, test-fix loops, periodic `/compact`, checkpoints, and safe autonomous development.

Repository: **ByBrawe/opencode-loop**  
NPM package name: **@bybrawe/opencode-loop**

## Why this exists

Claude Code users often rely on a loop-like workflow where the agent finishes one step, then immediately continues with the next step. OpenCode is powerful, but long-running autonomous workflows usually need extra control around:

- auto-continue after idle
- compact / summarize scheduling
- `progress.md` and TODO-driven development
- test verification after each turn
- patch checkpoints
- maximum runtime limits
- failure limits
- safety prompts and destructive command guards

OpenCode Loop is designed for developers searching for:

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

> Note: The TUI `/loop` command is session-bound. It runs while OpenCode is open and the session receives idle events. If the terminal closes, the machine sleeps, the process is killed, or the provider connection is lost for a long time, the TUI loop cannot continue in the background. For long-running loops, use `opencode-loopd` daemon mode.


- **Claude Code style auto-continue** with `/loop 0s ...`.
- **Background daemon mode** with `opencode-loopd` for long-running loops outside the OpenCode TUI.
- **Interval loops** for prompts, slash commands, and shell commands.
- **Prompt-file support** with `--prompt-file loop-prompt.md` for long reusable instructions.
- **Include extra context files** with `--include-file`.
- **progress.md workflow** with `--progress-file progress.md`.
- **Large TODO support** with `--batch`.
- **Compact scheduling** with `/loop 200m /compact` or `--compact-every`.
- **Verification loops** with `--verify "npm test"`.
- **Preflight checks** with `--preflight "npm install"`.
- **Post-run commands** with `--postrun`.
- **Failure control** with `--max-failures` and `--pause-on-verify-fail`.
- **Runtime control** with `--max-runtime 6h`.
- **Checkpoints** with `--checkpoint-only` or `--git-checkpoint`.
- **Safe mode** with `--safe` and prompt-level destructive command warnings.
- **Branch setup** with `--branch ai-loop`.
- **Stop controls** with `--stop-file STOP_LOOP`, `--until`, `/loop-stop`, `/loop-pause`, `/loop-resume`, and `/loop-remove`.
- **Watch mode** with `--watch progress.md`.
- **Diagnostics** with `/loop-doctor`.
- **Starter progress file** with `/loop-init`.
- **State export** with `/loop-export`.

## Quick start

```text
/loop 0s continue from progress.md and implement the next unfinished TODO
```

This is the closest behavior to a Claude Code CLI style loop: every time OpenCode becomes idle, the loop can send the next continuation prompt.

A safer development loop:

```text
/loop 0s --name dev --ask-never --safe --no-overlap --batch 5 --compact-every 200m --checkpoint-only --progress-file progress.md Treat progress.md as the main project state file. Continue with the next unfinished TODO, implement it, mark completed items with [x], add useful follow-up TODOs when you discover them, run tests/lint/build when available, and keep going while work remains.
```

Periodic compact:

```text
/loop 200m --name compact --no-now /compact
```

Test-fix loop:

```text
/loop 0s --name testfix --ask-never --safe --verify "npm test" Continue from progress.md. If tests fail, analyze the failure, fix it, and run the tests again.
```

Shell command loop:

```text
/loop 10m --name tests --safe !npm test
```

## Background daemon

The `/loop` command is session-bound. It works while OpenCode is open and the current session emits idle/status events.

If you close OpenCode, restart the terminal, lose connection, or your PC sleeps, the TUI loop will not keep running.

For long-running loops, use the daemon:

```bash
opencode-loopd --project . --every 5m --prompt-file loop-prompt.md
```

Run immediately after each OpenCode turn:

```bash
opencode-loopd --project . --every 0s --prompt "continue from progress.md and implement the next unfinished TODO"
```

Limit runs:

```bash
opencode-loopd --project . --every 5m --max-runs 20 --prompt-file loop-prompt.md
```

Example `loop-prompt.md`:

```md
Continue from progress.md and implement the next unfinished TODO.

Rules:
- Do not ask questions.
- Make reasonable assumptions.
- Mark completed TODO items with [x].
- Add useful follow-up TODOs when needed.
- Run tests/lint/build when available.
- Do not run destructive commands such as git reset, git clean, rm -rf, force push, deploy, or production migrations.
- Keep going while work remains.
```

### Windows Task Scheduler

You can create a Windows scheduled task that runs a one-shot daemon job every N minutes:

```powershell
opencode-loopd install-task --project "C:\path\to\project" --every 10m --prompt-file loop-prompt.md --name OpenCodeLoop
```

Remove it:

```powershell
opencode-loopd uninstall-task --name OpenCodeLoop
```

For active development, a visible terminal running `opencode-loopd --project . --every 0s ...` is easier to monitor.


## Installation

### Recommended: install from npm

Install from npm with `npx`:

```bash
npx -y @bybrawe/opencode-loop
```

On Windows CMD:

```bat
npx -y @bybrawe/opencode-loop
```

On Windows PowerShell:

```powershell
npx -y @bybrawe/opencode-loop
```

The installer copies the plugin and slash command files into your OpenCode config directory.

Windows target paths:

```text
%USERPROFILE%\.config\opencode\plugins\opencode-loop.js
%USERPROFILE%\.config\opencode\commands\loop*.md
```

macOS / Linux target paths:

```text
~/.config/opencode/plugins/opencode-loop.js
~/.config/opencode/commands/loop*.md
```

Then fully restart OpenCode and run:

```text
/loop-help
/loop-doctor
```

The npm package also installs the `opencode-loopd` CLI for background loops:

```bash
opencode-loopd --help
```

### Why `npx` is the recommended npm install

OpenCode can load npm plugins from the `plugin` array in `opencode.json`, but OpenCode slash commands are discovered from command definitions such as markdown files in a `commands/` directory or command entries in config. The `npx` installer installs both parts: the plugin file and the `/loop-*` command files.

Use the OpenCode config-only method only if you already installed the command files separately or you are only testing plugin loading.

### Optional: OpenCode config package entry

If you want OpenCode to load the npm plugin package directly, add the scoped package name to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@bybrawe/opencode-loop"]
}
```

Use the scoped package name exactly as shown. `opencode-loop` without `@bybrawe/` is a different npm package name.

If `/loop` does not appear after using only the config method, run the installer once:

```bash
npx -y @bybrawe/opencode-loop
```

### Install from GitHub

Use this if you want to install from source instead of npm.

Windows PowerShell:

```powershell
git clone https://github.com/ByBrawe/opencode-loop.git
cd opencode-loop
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

macOS / Linux / Git Bash:

```bash
git clone https://github.com/ByBrawe/opencode-loop.git
cd opencode-loop
chmod +x ./scripts/install.sh
./scripts/install.sh
```

Then restart OpenCode and run:

```text
/loop-help
/loop-doctor
```

### Manual global install

Windows PowerShell:

```powershell
mkdir "$env:USERPROFILE\.config\opencode\plugins" -Force
mkdir "$env:USERPROFILE\.config\opencode\commands" -Force
copy .\src\index.js "$env:USERPROFILE\.config\opencode\plugins\opencode-loop.js"
copy .\commands\*.md "$env:USERPROFILE\.config\opencode\commands\"
```

macOS / Linux:

```bash
mkdir -p ~/.config/opencode/plugins ~/.config/opencode/commands
cp ./src/index.js ~/.config/opencode/plugins/opencode-loop.js
cp ./commands/*.md ~/.config/opencode/commands/
```

### Project-local install

Use this when you want the plugin to be available only inside one repository.

```bash
mkdir -p .opencode/plugins .opencode/commands
cp ./src/index.js .opencode/plugins/opencode-loop.js
cp ./commands/*.md .opencode/commands/
```

On Windows PowerShell:

```powershell
mkdir .opencode\plugins -Force
mkdir .opencode\commands -Force
copy .\src\index.js .opencode\plugins\opencode-loop.js
copy .\commands\*.md .opencode\commands\
```

<<<<<<< HEAD
=======
### npm install - after publishing `@bybrawe/opencode-loop`

Do **not** use this section for a plain GitHub clone. This is only for the npm package.

The npm package name is scoped:

```text
@bybrawe/opencode-loop
```

Recommended npm install command:

```bash
npx -y @bybrawe/opencode-loop
```

This copies the plugin file and all `/loop-*` markdown command files into your OpenCode config directory, then you restart OpenCode. This is the most reliable install path because OpenCode slash commands are discovered from command files.

If you only want OpenCode to load the npm plugin package directly, add the scoped package name to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@bybrawe/opencode-loop"]
}
```


>>>>>>> 600c1cf8146d317efd682e20298f53c0cf2bf213
### Verify installation

After restarting OpenCode, run:

```text
/loop-help
/loop-doctor
```

If the commands do not appear:

1. Make sure OpenCode was fully restarted.
2. Check that `opencode-loop.js` exists in the OpenCode plugin directory.
3. Check that `loop.md`, `loop-help.md`, and the other command files exist in the OpenCode commands directory.
4. Run `npx -y @bybrawe/opencode-loop` again to reinstall the command files.

## Multiple loops and duplicate protection

By default, `/loop ...` uses an upsert/replace behavior. Running `/loop 5m ...` again replaces the existing default loop instead of creating duplicate jobs.

Use `--name` to manage separate named loops, or `--multi` when you intentionally want multiple loops with the same shape:

```text
/loop 5m --name dev continue from progress.md
/loop 200m --name compact /compact
/loop 10m --multi !npm test
```

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
| `/loop-doctor` | Diagnose plugin/session state |
| `/loop-init [file]` | Create a starter `progress.md` or another progress file |
| `/loop-export` | Export current loop state as JSON |

## Preset commands

| Command | Purpose |
|---|---|
| `/loop-dev 0s` | General autonomous OpenCode development loop |
| `/loop-progress 0s` | Follow `progress.md` and TODOs |
| `/loop-safe-dev 0s` | Safe dev loop with ask-never, batch 5, and patch checkpoints |
| `/loop-testfix 0s "npm test"` | Run, fix, and re-run tests |
| `/loop-compact 200m` | Compact loop shortcut |

## Intervals

```text
0s     run whenever OpenCode becomes idle, like Claude Code auto-continue
5m     run every 5 minutes when idle
200m   run every 200 minutes when idle
1h     run every hour when idle
```

The plugin is **idle-driven**. It checks jobs when OpenCode becomes idle, so it avoids intentionally starting a second agent turn on top of an active one.

## Actions

### Prompt action

```text
/loop 0s continue from progress.md. Work on the next unfinished TODO. Mark completed items with [x].
```

### Prompt file action

Use this when the prompt is too long for a single command line:

```text
/loop 0s --prompt-file loop-prompt.md
```

Example `loop-prompt.md`:

```md
Continue from progress.md.
Do not ask questions unless truly blocked.
Make reasonable assumptions and keep working.
Complete TODOs in order and mark finished items with [x].
Add useful follow-up TODOs when you discover them.
Run tests, lint, or build when available.
Do not run destructive commands, force pushes, production deploys, or database resets.
```

### Include extra context files

```text
/loop 0s --include-file ARCHITECTURE.md --include-file progress.md continue with the next implementation task
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

### `--max-runtime <duration>`

Stop after total runtime from loop creation.

```text
/loop 0s --max-runtime 6h continue from progress.md
```

### `--timeout <duration>`

Best-effort abort after a single run timeout.

```text
/loop 0s --timeout 30m continue from progress.md
```

### `--max-failures <n>`

Pause after repeated verify/postrun failures.

```text
/loop 0s --verify "npm test" --max-failures 3 continue from progress.md and fix test failures
```

### `--pause-on-verify-fail`

Pause immediately after the first verify failure.

```text
/loop 0s --verify "npm test" --pause-on-verify-fail continue from progress.md
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

### `--postrun "<command>"`

Runs a shell command after each assistant turn and verification.

```text
/loop 0s --postrun "git status --short" continue from progress.md
```

### `--notify "<command>"`

Runs a shell command when a loop stops or pauses due to a control condition. The command can use `{job}` and `{reason}` placeholders.

```text
/loop 0s --max-runtime 6h --notify "echo {job} stopped because {reason}" continue from progress.md
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

Safe mode warns against or blocks patterns such as `git reset`, `git clean`, `rm -rf`, `git push`, `terraform destroy`, destructive delete commands, and production deploys.

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

### `--dry-run`

Parse and preview a loop without saving it.

```text
/loop 0s --dry-run --ask-never continue from progress.md
```

### `--now` and `--no-now`

By default a new loop is due immediately. Use `--no-now` to wait for the first interval.

```text
/loop 200m --no-now /compact
```

## Recommended recipes

### Claude Code style auto-continue loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --batch 5 --compact-every 200m --checkpoint-only --progress-file progress.md Treat progress.md as the main project state file. Continue with the next unfinished TODO, implement it, mark completed items with [x], add useful follow-up TODOs when you discover them, run tests/lint/build when available, and keep going while work remains.
```

### Long-running autonomous development loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --compact-every 20 --timeout 45m --max-runtime 6h --max-failures 3 --stop-file STOP_LOOP --checkpoint-only Continue from progress.md. Do not ask questions. Make reasonable assumptions. Complete TODOs in order, mark finished items with [x], add useful new ideas to progress.md, and keep going while work remains.
```

### Test-fix loop

```text
/loop 0s --name testfix --ask-never --safe --verify "npm test" --max-failures 3 Continue from progress.md. If tests fail, analyze the failure, fix it, and run the tests again.
```

### Compact loop

```text
/loop 200m --name compact --no-now /compact
```

### Prompt file loop

```text
/loop 0s --name dev --prompt-file loop-prompt.md --checkpoint-only --max-runtime 6h
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

## Example progress.md

Create one with:

```text
/loop-init
```

Example content:

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

## Bug fixes and hardening in v0.4.0

- Renamed the public package/repo metadata to `opencode-loop` for `ByBrawe/opencode-loop`.
- Replaced project-specific examples with public, English OpenCode examples.
- Added `--prompt-file` for long prompts instead of huge command lines.
- Added `--include-file` for extra context files.
- Added `--max-runtime` so loops can stop after a total runtime.
- Added `--max-failures` and `--pause-on-verify-fail` for failing verification loops.
- Added `--postrun` and `--notify` hooks.
- Added `/loop-doctor`, `/loop-init`, and `/loop-export`.
- Fixed the max-runs/checkpoint ordering issue so the last run can still finalize and checkpoint.
- Improved no-overlap behavior and state cleanup for non-assistant actions such as `/compact`.
- Kept all README examples in English for public GitHub discovery.

## Notes and limits

- The plugin is idle-driven. It does not run a background daemon while OpenCode is busy.
- `--timeout` is best-effort and relies on OpenCode's abort API.
- `--verify`, `--preflight`, `--postrun`, and `--notify` run shell commands, so configure OpenCode permissions carefully.
- `--until` scans common state files and a limited number of markdown/text/json/yaml files to avoid walking huge projects.
- `--safe` reduces risk but does not replace careful OpenCode permissions.
- For truly unattended multi-hour work, use a disposable branch or worktree and checkpoint patches.

## License

MIT
