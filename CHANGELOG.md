# Changelog

## 0.3.0

SEO/public release cleanup and new loop controls:

- Renamed user-facing copy to **OpenCode Loop - Claude Code Style Auto-Continue for OpenCode**.
- Removed Bybrawe branding from the README/title/package metadata so the repo targets OpenCode search terms.
- Added `/loop-help`.
- Added `/loop-logs`.
- Added `--verify "<command>"` to run a real verification command after each assistant turn and feed failures into the next prompt.
- Added `--preflight "<command>"` to run a command before each loop turn and pause on failure.
- Added `--stop-file <file>` as a simple project-local kill switch.
- Added `--progress-file <file>` to tell the agent which progress/TODO file to treat as primary.
- Added `.opencode/opencode-loop/loop.log` event logging.
- Renamed local plugin file to `opencode-loop.js`.
- Renamed state directory to `.opencode/opencode-loop/`.

## 0.2.0

Added advanced loop controls:

- `--max-runs`
- `--timeout`
- `--until`
- `--no-overlap` / `--allow-overlap`
- `--compact-every`
- `--test`
- `--checkpoint-only`
- `--git-checkpoint`
- `--branch`
- `--safe`
- `--batch`
- `--quiet`
- `--ask-never`
- `--watch`
- `/loop-remove`
- `/loop-pause`
- `/loop-resume`
- `/loop-clear`
- `/loop-dev`
- `/loop-testfix`
- `/loop-compact`
- `/loop-progress`
- `/loop-safe-dev`

## 0.1.0

Initial release with:

- `/loop`
- `/loop-status`
- `/loop-now`
- `/loop-stop`
- prompt, slash-command, compact and shell actions
