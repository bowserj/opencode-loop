# Bybrawe OpenCode Loop

Claude Code style loop jobs for OpenCode.

Use it when you want OpenCode to keep going after it becomes idle, periodically run `/compact`, run shell checks, checkpoint diffs, follow `progress.md`, or process a huge TODO list without manually typing "continue" every time.

## What it does

The plugin registers commands such as:

```text
/loop 0s progress.md'ye gore devam et
/loop 5m --ask-never --safe progress.md'ye gore devam et
/loop 200m /compact
/loop 10m !npm test
/loop-safe-dev 0s
/loop-status
/loop-pause dev
/loop-resume dev
/loop-stop all
```

The loop runs only when the OpenCode session is idle, so it does not intentionally start a second agent turn on top of an active one.

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

## Install as npm/GitHub plugin later

After publishing this repository/package, users can add it to their OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@bybrawe/opencode-loop"]
}
```

For local development, the install scripts copy `src/index.js` into the OpenCode plugin directory and the command markdown files into the OpenCode commands directory.

OpenCode supports local plugins from config/plugin directories and local commands from command markdown files.

## Core commands

| Command | Purpose |
|---|---|
| `/loop <interval> <action>` | Add an interval/idle loop job |
| `/loop-status` | Show active loop jobs |
| `/loop-now [id/name/number/all]` | Run loop job(s) immediately |
| `/loop-pause [id/name/number/all]` | Pause loop job(s) |
| `/loop-resume [id/name/number/all]` | Resume loop job(s) |
| `/loop-remove [id/name/number/all]` | Remove loop job(s) |
| `/loop-stop [id/name/number/all]` | Alias for remove/stop |
| `/loop-clear` | Remove all loop jobs for the current session |

## Preset commands

| Command | Purpose |
|---|---|
| `/loop-dev 0s` | General autonomous dev loop |
| `/loop-progress 0s` | Follow `progress.md` and TODOs |
| `/loop-safe-dev 0s` | Safe dev loop with ask-never, batch 5 and patch checkpoints |
| `/loop-testfix 0s "npm test"` | Run/fix/re-run tests |
| `/loop-compact 200m` | Compact loop shortcut |

## Intervals

Examples:

```text
0s     every idle event
5m     every 5 minutes when idle
200m   every 200 minutes when idle
1h     every hour when idle
```

`0s` is the closest to Claude Code style "continue as soon as the current turn ends".

## Actions

### Prompt action

```text
/loop 0s progress.md'ye bakarak kaldigin yerden devam et. TODO'lari yap, bitenleri [x] yap.
```

### Slash command action

```text
/loop 200m /compact
/loop 15m /review current changes
```

`/compact` and `/summarize` map to `client.session.summarize()`.

### Shell action

```text
/loop 10m !npm test
/loop 30m $pnpm lint
```

Shell actions starting with `!` or `$` map to `client.session.shell()`.

## Flags

### `--name <name>`

Name a loop so you can manage it later.

```text
/loop 0s --name dev progress.md'ye gore devam et
/loop-status
/loop-pause dev
/loop-resume dev
/loop-stop dev
```

### `--max-runs <n>`

Stop after N runs.

```text
/loop 5m --max-runs 20 progress.md'ye gore devam et
```

### `--timeout <duration>`

Try to abort the active run after a timeout.

```text
/loop 0s --timeout 30m progress.md'ye gore devam et
```

This uses the OpenCode session abort API when available. Treat it as best-effort, not a hard OS process kill.

### `--until <text>`

Stop when a marker appears in common state files such as `progress.md`, `TODO.md`, or `.opencode/bybrawe-loop/until.txt`.

```text
/loop 5m --until ALL_DONE progress.md'ye gore devam et
```

### `--no-overlap` and `--allow-overlap`

`--no-overlap` is the default. The plugin only starts a new job when the session is idle.

```text
/loop 5m --no-overlap progress.md'ye gore devam et
```

### `--compact-every <n|duration>`

Compact before a run every N runs or every duration.

```text
/loop 0s --compact-every 20 progress.md'ye gore devam et
/loop 0s --compact-every 200m progress.md'ye gore devam et
```

### `--test "<command>"`

Adds a test instruction to prompt actions.

```text
/loop 0s --test "npm test" progress.md'ye gore devam et
```

### `--checkpoint-only`

Save `git status` and `git diff --binary` snapshots under:

```text
.opencode/bybrawe-loop/checkpoints/<session>/
```

Example:

```text
/loop 0s --checkpoint-only progress.md'ye gore devam et
```

### `--git-checkpoint`

Save a patch checkpoint and attempt to commit all changes after each completed run.

```text
/loop 0s --git-checkpoint progress.md'ye gore devam et
```

Use this carefully. It runs `git add -A` and `git commit` when changes exist.

### `--branch <name>`

Switch to a branch before the first run, or create it if it does not exist.

```text
/loop 0s --branch ai-loop progress.md'ye gore devam et
```

### `--safe`

Adds safety instructions to prompt actions and blocks obviously destructive shell actions.

```text
/loop 0s --safe progress.md'ye gore devam et
```

Safe mode warns against or blocks patterns such as `git reset`, `git clean`, `rm -rf`, `git push`, `terraform destroy`, destructive delete commands and production deploys.

### `--batch <n>`

Tell the agent to process at most N TODO items per run.

```text
/loop 0s --batch 5 progress.md'ye gore devam et
```

### `--quiet`

Tell the agent to keep replies short.

```text
/loop 0s --quiet progress.md'ye gore devam et
```

### `--ask-never`

Tell the agent not to ask questions and to make reasonable assumptions.

```text
/loop 0s --ask-never progress.md'ye gore devam et
```

### `--watch <file>`

Run when watched file metadata changes. This is still checked on idle events.

```text
/loop --watch progress.md progress.md degisti, kaldigin yerden devam et
/loop 5m --watch progress.md progress.md degisti veya sure dolduysa devam et
```

You can pass multiple `--watch` flags.

### `--now` and `--no-now`

By default a new loop is due immediately. Use `--no-now` to wait for the first interval.

```text
/loop 200m --no-now /compact
```

## Recommended commands

### Continuous progress loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --batch 5 --compact-every 200m --checkpoint-only progress.md ana kaynak olsun. TODO'lardaki tamamlanmamis maddeleri sirayla yap. Bitirdiklerini [x] yap. Yeni gelistirme fikri, bug veya eksik gorursen progress.md altina TODO olarak ekle. Test/lint/build varsa calistir. Yapilacak is kaldigi surece devam et.
```

### Fully aggressive loop

```text
/loop 0s --name dev --ask-never --safe --no-overlap --compact-every 20 --timeout 45m progress.md'ye gore surekli devam et. Bana soru sorma. Makul varsayim yap. TODO'lari yap, bitenleri [x] yap, yeni fikirleri ekle.
```

### Compact loop

```text
/loop 200m --name compact --no-now /compact
```

### Test loop

```text
/loop 10m --name tests --safe !npm test
```

### Watch progress.md

```text
/loop --watch progress.md --name watch-progress progress.md'ye bak ve degisen plana gore devam et
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
.opencode/bybrawe-loop/
```

Patch checkpoints are stored under:

```text
.opencode/bybrawe-loop/checkpoints/
```

## Notes and limits

- The plugin is idle-driven. It does not run a background daemon while OpenCode is busy.
- `--timeout` is best-effort and relies on OpenCode's abort API.
- `--until` scans common state files and a limited number of markdown/text/json/yaml files to avoid walking huge projects.
- `--safe` reduces risk but does not replace careful OpenCode permissions.
- If you want truly unattended multi-hour work, use a disposable branch/worktree and checkpoint patches.

## Publishing to GitHub

```bash
git init
git add .
git commit -m "Initial Bybrawe OpenCode Loop plugin"
git branch -M main
git remote add origin https://github.com/bybrawe/opencode-loop.git
git push -u origin main
```

## License

MIT
