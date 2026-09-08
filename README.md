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

Requires Git and [Bun](https://bun.sh) for the Pi extension dependencies.

```bash
git clone git@github.com:0xABAN/configs.git ~/dev/configs
cd ~/dev/configs
chmod +x install.sh
./install.sh
```

Existing files are renamed `*.bak.<timestamp>` before linking. The installer also removes `~/AGENTS.md` (backing up a regular file first) so Pi loads only the shared global file and repository instructions.

## Shell navigation

Install the shell dependencies with `brew install fzf zoxide zsh-autosuggestions`,
then open a new shell. `cd` uses zoxide to learn frequently visited directories;
`cdi` opens its fuzzy picker. Inline suggestions come from command history, not
zoxide's directory ranking. Pressing Enter on a partial directory name still
jumps to zoxide's best match. History is saved in `~/.zsh_history`.

## Secrets (never committed)

| File | Why |
|------|-----|
| `~/.zshrc.local` | API keys / machine exports |
| `~/.pi/agent/mcp.json` | API sessions / tokens |
| `~/.pi/agent/auth.json` | Provider auth |
| `sessions/`, caches, `npm/` | Machine-local runtime |

After install, set `LEETCODE_SESSION` (and any other keys) in `mcp.json`, or export them in your shell and point env there.

## Pi extensions

Extension code lives in [pi-extensions](https://github.com/0xABAN/pi-extensions), not in a second copy here. Pi settings reference its top-level `inline-skills/` and `dj/` packages under `~/dev/pi-extensions`.

`./install.sh` clones that repository when missing, validates both packages, and installs dependencies from its lockfile without running package scripts. It never pulls over existing work; missing packages or failed dependency installation stop before changing config links. Edit extensions in that checkout, then `/reload` in Pi. Other existing extensions remain under `pi/agent/extensions`.

DJ replaces the old `agent-dj.ts` copy. Use `/dj theme`, `/dj layout`, and `/dj placement`; `/dj` toggles visibility. Existing Spotify credentials and placement are imported once into `~/.pi/agent/dj/` (machine-local, never committed). If reconnection is needed, use `/dj auth`, not the legacy Python install command, which can recreate the old Pi extension. See the [DJ guide](https://github.com/0xABAN/pi-extensions/tree/main/dj).

The installer patches the installed powerline package so below-editor rows stay **powerline → DJ → last prompt**, without DJ replacing the prompt. After updating/reinstalling powerline, run `python3 pi/agent/patches/powerline-dj.py` from this checkout, then `/reload`. The patch skips missing installs and refuses changed upstream code rather than guessing.

## Sync workflow

Commit and push changes in the repository that owns them. For extension folder moves, push `pi-extensions` before the corresponding `configs` update so new installs can find the referenced paths.

```bash
# on machine A after edits
cd ~/dev/configs && git add -A && git commit -m "..." && git push

# on machine B
cd ~/dev/configs && git pull --ff-only
cd ~/dev/pi-extensions && git pull --ff-only
# re-run ~/dev/configs/install.sh if paths or extension dependencies changed
# then run /reload in Pi
```
