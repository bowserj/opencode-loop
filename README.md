# Bybrawe OpenCode Loop

Claude Code style loop jobs for OpenCode.

Use it when you want OpenCode to keep going after it becomes idle, run periodic `/compact`, or run shell checks on an interval.

## Features

- `/loop 0s <prompt>`: continue on every idle event.
- `/loop 5m <prompt>`: continue every 5 minutes when the session is idle.
- `/loop 200m /compact`: compact/summarize periodically.
- `/loop 10m !npm test`: run shell commands periodically.
- `/loop-status`, `/loop-now`, `/loop-stop`.
- Session-scoped state stored in `.opencode/bybrawe-loop/`.
- Works as a local plugin or npm/GitHub package.

## Install from ZIP or cloned repo

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

### macOS / Linux / Git Bash

```bash
./scripts/install.sh
```

Restart OpenCode after installation.

## Install as npm/GitHub plugin later

After publishing this repository/package, users can also add it to their OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@bybrawe/opencode-loop"]
}
```

For local development, the install scripts copy `src/index.js` into the OpenCode plugin directory and the command markdown files into the OpenCode commands directory.

OpenCode loads local plugins from `.opencode/plugins/` or `~/.config/opencode/plugins/`, and local commands from `.opencode/commands/` or `~/.config/opencode/commands/`.

## Commands

### Continuous Claude-style loop

```text
/loop 0s progress.md'ye bakarak kaldığın yerden devam et. Bana soru sorma. Makul varsayımlar yap. TODO'ları sırayla yap, bitirdiklerini [x] yap, yeni fikirleri progress.md altına ekle. Test/lint/build varsa çalıştır. Silme, reset, clean, push veya deploy yapma.
```

`0s` means every idle event. This is the closest behavior to a continuous Claude Code style loop.

### Every 5 minutes

```text
/loop 5m progress.md'ye göre devam et, TODO'ları uygula, bitenleri [x] yap.
```

### Compact every 200 minutes

```text
/loop 200m /compact
```

If you do not want the first compact immediately:

```text
/loop 200m --no-now /compact
```

### Run shell command every 10 minutes

```text
/loop 10m !npm test
```

### Name a loop

```text
/loop 0s --name dev progress.md'ye göre sürekli devam et.
/loop 200m --name compact /compact
```

### Stop

```text
/loop-stop
```

Stop by name or id:

```text
/loop-stop dev
```

### Status

```text
/loop-status
```

### Run now

```text
/loop-now
/loop-now dev
```

## Important notes

- The plugin runs jobs only when the session is idle. It does not start a second agent turn while another one is already running.
- A prompt action starts an assistant turn. The plugin waits until OpenCode reports the session as busy/idle again before starting another prompt action.
- `/compact` maps to `client.session.summarize()`.
- Slash actions like `/review something` map to `client.session.command()`.
- Shell actions starting with `!` or `$` map to `client.session.shell()`.
- Use OpenCode permissions carefully. Full `permission: "allow"` is convenient but risky.

## Suggested permission config

See `examples/opencode.json` for a safer config that allows reading/editing/tests but asks or denies destructive commands.

## Publishing to GitHub

```bash
git init
git add .
git commit -m "Initial Bybrawe OpenCode Loop plugin"
git branch -M main
git remote add origin https://github.com/bybrawe/opencode-loop.git
git push -u origin main
```

Then create a GitHub release and upload the ZIP.

## License

MIT
