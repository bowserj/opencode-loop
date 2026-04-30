#!/usr/bin/env sh
set -eu

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGIN_DIR="$CONFIG_DIR/plugins"
COMMAND_DIR="$CONFIG_DIR/commands"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

mkdir -p "$PLUGIN_DIR" "$COMMAND_DIR"
cp "$ROOT_DIR/src/index.js" "$PLUGIN_DIR/bybrawe-loop.js"
cp "$ROOT_DIR/commands"/*.md "$COMMAND_DIR/"

echo "Installed Bybrawe OpenCode Loop plugin."
echo "Plugin:   $PLUGIN_DIR/bybrawe-loop.js"
echo "Commands: $COMMAND_DIR/loop*.md"
echo "Restart OpenCode, then run: /loop-status"
