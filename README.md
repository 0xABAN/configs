# configs

Neovim + Pi coding-agent configs. Clone on a new machine and run `./install.sh`.

## Layout

```
zsh/.zshrc            → ~/.zshrc  (no secrets; source ~/.zshrc.local)
nvim/                 → ~/.config/nvim  (AstroNvim v6 template + woody)
pi/agent/             → ~/.pi/agent/* (selected paths)
  AGENTS.md           → ~/.pi/agent/AGENTS.md + ~/.codex/AGENTS.md
  mcp.json.example    → copy to mcp.json locally (secrets)
pi/rpiv-todo/config.json → ~/.config/rpiv-todo/config.json
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

## Pi extensions

Extension code lives in [pi-extensions](https://github.com/0xABAN/pi-extensions), not in a second copy here. Each extension has its own top-level folder there; Pi settings here reference `~/dev/pi-extensions/inline-skills`.

`./install.sh` clones that repository when missing and leaves existing checkouts untouched. Edit extensions in `~/dev/pi-extensions`, then run `/reload` in Pi. Existing extensions still under `pi/agent/extensions` have not been migrated.

## Sync workflow

Commit and push changes in the repository that owns them. For extension folder moves, push `pi-extensions` before the corresponding `configs` update so new installs can find the referenced paths.

```bash
# on machine A after edits
cd ~/dev/configs && git add -A && git commit -m "..." && git push

# on machine B
cd ~/dev/configs && git pull --ff-only
cd ~/dev/pi-extensions && git pull --ff-only
# re-run ~/dev/configs/install.sh if new paths were added
# then run /reload in Pi
```
