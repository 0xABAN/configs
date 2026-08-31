#!/usr/bin/env bash
# Symlink tracked configs into place. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TS="$(date +%Y%m%d%H%M%S)"

backup() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    if [[ -L "$path" ]]; then
      rm "$path"
    else
      mv "$path" "${path}.bak.${TS}"
      echo "backed up $path -> ${path}.bak.${TS}"
    fi
  fi
}

link() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  backup "$dest"
  ln -sfn "$src" "$dest"
  echo "link $dest -> $src"
}

echo "== nvim =="
mkdir -p "$HOME/.config"
link "$ROOT/nvim" "$HOME/.config/nvim"

echo "== pi agent =="
mkdir -p "$HOME/.pi/agent"
for name in \
  settings.json \
  keybindings.json \
  AGENTS.md \
  subagents.json \
  agent-tool-description.md \
  themes \
  skills \
  agents \
  extensions
do
  link "$ROOT/pi/agent/$name" "$HOME/.pi/agent/$name"
done

echo "== rpiv-todo config =="
mkdir -p "$HOME/.config/rpiv-todo"
link "$ROOT/rpiv-todo/config.json" "$HOME/.config/rpiv-todo/config.json"

# secrets stay machine-local
if [[ ! -f "$HOME/.pi/agent/mcp.json" ]]; then
  cp "$ROOT/pi/agent/mcp.json.example" "$HOME/.pi/agent/mcp.json"
  echo "created ~/.pi/agent/mcp.json from example — fill LEETCODE_SESSION (etc.)"
else
  echo "left existing ~/.pi/agent/mcp.json in place (not symlinked; secrets)"
fi


# Re-apply local tints on installed pi packages
if [[ -f "$ROOT/pi/agent/patches/rpiv-todo-gray.py" ]]; then
  python3 "$ROOT/pi/agent/patches/rpiv-todo-gray.py" || true
fi

echo
echo "done. edit files under: $ROOT"
echo "new laptop: git clone <repo> ~/dev/configs && cd ~/dev/configs && ./install.sh"
