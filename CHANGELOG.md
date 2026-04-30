# Changelog

## 0.3.1

Public README cleanup and English-first examples:

- Rewrote all README examples in English for public GitHub/NPM usage.
- Removed repository publishing instructions from the README.
- Replaced internal/project-specific wording with OpenCode Loop and Claude Code style loop terminology.
- Added a ready-to-copy `progress.md` example for autonomous OpenCode workflows.
- Updated package metadata and license attribution for a public contributor-owned project.
- Updated the missing-action help text to use an English example.


## 0.3.0

SEO/public release cleanup and new loop controls:

- Renamed user-facing copy to **OpenCode Loop - Claude Code Style Auto-Continue for OpenCode**.
- Cleaned public-facing README/title/package metadata so the repo targets OpenCode search terms.
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
