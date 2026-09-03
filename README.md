# configs

Neovim + Pi coding-agent configs. Clone on a new machine and run `./install.sh`.

## Layout

```
zsh/.zshrc            → ~/.zshrc  (no secrets; source ~/.zshrc.local)
nvim/                 → ~/.config/nvim  (AstroNvim v6 template + woody)
pi/agent/             → ~/.pi/agent/* (selected paths)
  AGENTS.md           → ~/.pi/agent/AGENTS.md + ~/.codex/AGENTS.md
  mcp.json.example    → copy to mcp.json locally (secrets)
```

## Install

```bash
git clone git@github.com:0xABAN/configs.git ~/dev/configs
cd ~/dev/configs
chmod +x install.sh
./install.sh
```

Existing files are renamed `*.bak.<timestamp>` before linking. The installer also removes `~/AGENTS.md` (backing up a regular file first) so Pi loads only the shared global file and repository instructions.

## Secrets (never committed)

| File | Why |
|------|-----|
| `~/.zshrc.local` | API keys / machine exports |
| `~/.pi/agent/mcp.json` | API sessions / tokens |
| `~/.pi/agent/auth.json` | Provider auth |
| `sessions/`, caches, `npm/` | Machine-local runtime |

After install, set `LEETCODE_SESSION` (and any other keys) in `mcp.json`, or export them in your shell and point env there.

## Sync workflow

```bash
# on machine A after edits
cd ~/dev/configs && git add -A && git commit -m "..." && git push

# on machine B
cd ~/dev/configs && git pull
# re-run ./install.sh only if new paths were added
```
