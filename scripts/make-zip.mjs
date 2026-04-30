import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(dirname(root), "bybrawe-opencode-loop.zip")
const result = spawnSync("zip", ["-r", out, ".", "-x", "*.git*"], { cwd: root, stdio: "inherit" })
process.exit(result.status || 0)
