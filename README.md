# dotfiles

Neovim + Pi coding-agent configs. Clone on a new machine and run `./install.sh`.

## Layout

```
nvim/                 → ~/.config/nvim
pi/agent/             → ~/.pi/agent/* (selected paths)
  mcp.json.example    → copy to mcp.json locally (secrets)
```

## Install

```bash
git clone git@github.com:YOU/dotfiles.git ~/dev/dotfiles
cd ~/dev/dotfiles
chmod +x install.sh
./install.sh
```

Existing files are renamed `*.bak.<timestamp>` before linking.

## Secrets (never committed)

| File | Why |
|------|-----|
| `~/.pi/agent/mcp.json` | API sessions / tokens |
| `~/.pi/agent/auth.json` | Provider auth |
| `sessions/`, caches, `npm/` | Machine-local runtime |

After install, set `LEETCODE_SESSION` (and any other keys) in `mcp.json`, or export them in your shell and point env there.

## Sync workflow

```bash
# on machine A after edits
cd ~/dev/dotfiles && git add -A && git commit -m "..." && git push

# on machine B
cd ~/dev/dotfiles && git pull
# re-run ./install.sh only if new paths were added
```
