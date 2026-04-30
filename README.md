# OpenCode Loop - Claude Code Style Auto-Continue for OpenCode

**OpenCode Loop** adds a Claude Code style `/loop` command to OpenCode. It keeps an OpenCode agent moving after each idle turn, can run `/compact` on a schedule, can follow `progress.md`, can process huge TODO lists, can run tests, can save checkpoints, and can continue development without manually typing “continue” every time.

This is an **OpenCode plugin for autonomous coding loops**, also useful as an OpenCode Ralph loop alternative, OpenCode auto-continue plugin, OpenCode `/compact` scheduler, and long-running AI coding agent workflow helper.

## Why use it?

Use OpenCode Loop when you want:

- **Claude Code style loop behavior** inside OpenCode.
- OpenCode to **continue automatically when the session becomes idle**.
- A project agent to keep reading `progress.md` or `TODO.md` and keep implementing the next item.
- Automatic `/compact` or `/summarize` every N minutes or every N runs.
- Shell loops such as `npm test`, `pnpm lint`, `pytest`, or custom scripts.
- Safer unattended work with `--safe`, `--ask-never`, `--no-overlap`, checkpoints, stop files, and verification commands.

## Quick examples

```text
/loop 0s progress.md'ye bakarak kaldığın yerden devam et
/loop 0s --ask-never --safe --batch 5 --checkpoint-only progress.md'ye göre TODO'ları sırayla yap
/loop 200m --no-now /compact
/loop 10m !npm test
/loop 0s --verify "npm test" progress.md'ye göre geliştir ve testleri düzelt
/loop-safe-dev 0s
/loop-status
/loop-logs
/loop-stop all
```

`0s` is the closest behavior to **Claude Code CLI loop / auto continue**: every time OpenCode becomes idle, the loop can immediately send the next instruction.

## Install from ZIP or cloned repo

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

### macOS / Linux / Git Bash

```bash
chmod +x ./scripts/install.sh
./scripts/install.sh
```

Restart OpenCode after installation.

## Install as an OpenCode plugin later

After publishing this repository/package, users can add it to their OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-loop-like-claude"]
}
```

For a GitHub install, publish the repo and use your preferred OpenCode plugin install format, for example a git package reference.

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
| `/loop-dev 0s` | General autonomous OpenCode dev loop |
| `/loop-progress 0s` | Follow `progress.md` and TODOs |
| `/loop-safe-dev 0s` | Safe dev loop with ask-never, batch 5 and patch checkpoints |
| `/loop-testfix 0s "npm test"` | Run/fix/re-run tests |
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
/loop 0s progress.md'ye bakarak kaldığın yerden devam et. TODO'ları yap, bitenleri [x] yap.
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
/loop 0s --name dev progress.md'ye göre devam et
/loop-pause dev
/loop-resume dev
/loop-stop dev
```

### `--max-runs <n>`

Stop after N runs.

```text
/loop 5m --max-runs 20 progress.md'ye göre devam et
```

### `--timeout <duration>`

Best-effort abort after a timeout.

```text
/loop 0s --timeout 30m progress.md'ye göre devam et
```

### `--until <text>`

Stop when a marker appears in common state files such as `progress.md`, `TODO.md`, or `.opencode/opencode-loop/until.txt`.

```text
/loop 5m --until ALL_DONE progress.md'ye göre devam et
```

### `--stop-file <file>`

Stop when a file appears. This is a simple manual kill switch.

```text
/loop 0s --stop-file STOP_LOOP progress.md'ye göre devam et
```

Create `STOP_LOOP` in the project root to stop that job.

### `--no-overlap` and `--allow-overlap`

`--no-overlap` is the default. It prevents a new run from being triggered while a previous run is still considered active.

```text
/loop 5m --no-overlap progress.md'ye göre devam et
```

### `--compact-every <n|duration>`

Compact before a run every N runs or every duration.

```text
/loop 0s --compact-every 20 progress.md'ye göre devam et
/loop 0s --compact-every 200m progress.md'ye göre devam et
```

### `--test "<command>"`

Adds a test instruction to prompt actions.

```text
/loop 0s --test "npm test" progress.md'ye göre devam et
```

### `--verify "<command>"`

Runs a real shell verification command after each assistant turn. If it fails, the next loop prompt includes the failure summary so the agent can fix it.

```text
/loop 0s --verify "npm test" progress.md'ye göre geliştir
```

### `--preflight "<command>"`

Runs a real shell command before each loop turn. If it fails, the loop pauses.

```text
/loop 0s --preflight "npm install" progress.md'ye göre devam et
```

### `--checkpoint-only`

Save `git status` and `git diff --binary` snapshots under:

```text
.opencode/opencode-loop/checkpoints/<session>/
```

### `--git-checkpoint`

Save a patch checkpoint and attempt to commit all changes after each completed run.

```text
/loop 0s --git-checkpoint progress.md'ye göre devam et
```

Use carefully. It runs `git add -A` and `git commit` when changes exist.

### `--branch <name>`

Switch to a branch before the first run, or create it if it does not exist.

```text
/loop 0s --branch ai-loop progress.md'ye göre devam et
```

### `--safe`

Adds safety instructions to prompt actions and blocks obviously destructive shell actions.

```text
/loop 0s --safe progress.md'ye göre devam et
```

Safe mode warns against or blocks patterns such as `git reset`, `git clean`, `rm -rf`, `git push`, `terraform destroy`, destructive delete commands and production deploys.

### `--batch <n>`

Tell the agent to process at most N TODO items per run.

```text
/loop 0s --batch 5 progress.md'ye göre devam et
```

### `--quiet`

Tell the agent to keep replies short.

```text
/loop 0s --quiet progress.md'ye göre devam et
```

### `--ask-never`

Tell the agent not to ask questions and to make reasonable assumptions.

```text
/loop 0s --ask-never progress.md'ye göre devam et
```

### `--progress-file <file>`

Tell the agent which state file to treat as the main progress/TODO source.

```text
/loop 0s --progress-file progress.md progress.md'ye göre devam et
```

### `--watch <file>`

Run when watched file metadata changes. This is still checked on idle events.

```text
/loop --watch progress.md progress.md değişti, kaldığın yerden devam et
/loop 5m --watch progress.md progress.md değişti veya süre dolduysa devam et
```

You can pass multiple `--watch` flags.

### `--now` and `--no-now`

By default a new loop is due immediately. Use `--no-now` to wait for the first interval.

```text
/loop 200m --no-now /compact
```

## Recommended OpenCode loop commands

### Claude Code style auto-continue loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --batch 5 --compact-every 200m --checkpoint-only --progress-file progress.md progress.md ana kaynak olsun. TODO'lardaki tamamlanmamış maddeleri sırayla yap. Bitirdiklerini [x] yap. Yeni geliştirme fikri, bug veya eksik görürsen progress.md altına TODO olarak ekle. Test/lint/build varsa çalıştır. Yapılacak iş kaldığı sürece devam et.
```

### Auto-fix tests loop

```text
/loop 0s --name testfix --ask-never --safe --verify "npm test" progress.md'ye göre devam et. Test hata verirse hatayı düzelt ve tekrar dene.
```

### Fully aggressive but safer long-running loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --compact-every 20 --timeout 45m --stop-file STOP_LOOP --checkpoint-only progress.md'ye göre sürekli devam et. Bana soru sorma. Makul varsayım yap. TODO'ları yap, bitenleri [x] yap, yeni fikirleri ekle.
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
/loop --watch progress.md --name watch-progress progress.md'ye bak ve değişen plana göre devam et
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

## SEO phrases this project targets

This repository intentionally documents the common search terms people use when looking for this workflow:

- OpenCode loop
- OpenCode Claude Code loop
- OpenCode auto continue
- OpenCode continue automatically
- OpenCode `/loop` command
- OpenCode compact scheduler
- OpenCode Ralph loop alternative
- Claude Code style loop for OpenCode
- autonomous coding loop for OpenCode
- OpenCode progress.md TODO automation

## Notes and limits

- The plugin is idle-driven. It does not run a background daemon while OpenCode is busy.
- `--timeout` is best-effort and relies on OpenCode's abort API.
- `--verify` and `--preflight` run shell commands, so configure OpenCode permissions carefully.
- `--until` scans common state files and a limited number of markdown/text/json/yaml files to avoid walking huge projects.
- `--safe` reduces risk but does not replace careful OpenCode permissions.
- If you want truly unattended multi-hour work, use a disposable branch/worktree and checkpoint patches.

## Publishing to GitHub

```bash
git init
git add .
git commit -m "Initial OpenCode Loop plugin"
git branch -M main
git remote add origin https://github.com/bybrawe/opencode-loop.git
git push -u origin main
```

Recommended GitHub repository description:

```text
Claude Code style /loop command for OpenCode: auto-continue, compact scheduling, progress.md TODO automation, test verification, checkpoints, and safe autonomous coding loops.
```

Recommended GitHub topics:

```text
opencode, opencode-plugin, claude-code, claude-code-loop, ai-coding-agent, autonomous-coding, auto-continue, compact, todo-automation, progress-md
```

## License

MIT
