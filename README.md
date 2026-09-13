# configs

Neovim + Pi coding-agent configs. Clone on a new machine and run `./install.sh`.

## Layout

```
zsh/.zshrc            → ~/.zshrc  (no secrets; source ~/.zshrc.local)
nvim/                 → ~/.config/nvim  (AstroNvim v6 + osaka-jade)
ghostty/themes/       → ~/.config/ghostty/themes/ (osaka-jade for cmux)
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

## Colors

`osaka-jade` keeps the reference's charcoal surfaces, with **`#439187`** as
the shared teal accent across Neovim, Pi, and cmux/Ghostty. Its darker
companion, **`#326d65`**, is for subtle borders, dividers, and cmux workspace
selection—not syntax or primary text.

The terminal owns the charcoal base background and its opacity. Neovim's
base highlights use `NONE`; Pi's base background variable uses `""` (terminal
default). Neither paints another charcoal layer over the terminal. Panels
(`#181a20`) and colored selections retain their explicit backgrounds. Terminal text
selections (including Pi), Neovim Visual mode, and completion selections
use the core teal (`#439187`) with white text (`#ffffff`). Search/diff backgrounds
remain neutral (`#282c30`). Prose uses soft white (`#D8DAD8`), with
near-white (`#F2F3F0`) for emphasis. Variables, strings, numbers, headings, editor
status text, and Pi tool output use cream (`#dedec5`).
Keywords, active highlights, functions, types, links, success states, and
additions use the core teal, as do terminal ANSI green/cyan, Pi's diamond,
and its context ball/meter. Neovim separators and floating-window borders,
and Pi's muted/Markdown borders, use the darker companion. Mode/thinking
label gradients and warning/error colors retain their existing palettes.
Outside selections, large surfaces never use green fills.
Supporting neutrals and subdued warning/error colors are chosen to fit;
ANSI colors use the same restrained treatment. No theme plugins required.

Pi and Neovim select it by default. The installer links the terminal theme;
activate it in `~/.config/ghostty/config` (also used by cmux):

```ini
theme = osaka-jade
background-opacity = 0.98
background-blur = 10
background-opacity-cells = true
```

Remove explicit background/foreground/selection overrides if they override
the theme. Also check `cmux themes list`: cmux's own theme override in
`~/Library/Application Support/com.cmuxterm.app/config.ghostty` takes
precedence over the shared Ghostty theme. Back up that file, then run
`cmux themes clear` to inherit the shared palette. `ghostty +show-config`
alone does not reveal this override. The old Black Metal override is backed
up locally in `~/.config/theme-backups/cmux-20260913-015205/`.

Merge these appearance keys into `~/.config/cmux/cmux.json`, preserving
unrelated settings and any other workspace-color options. The active-pane
outline stays disabled, and split dividers keep their default color:

```json
{
  "activePaneBorderColor": null,
  "paneBorderColor": null,
  "workspaceColors": {
    "selectionColor": "#326d65",
    "notificationBadgeColor": "#439187"
  }
}
```

Opacity 0.98 retains contrast while letting a little backdrop show through.
Base surfaces inherit one translucent background consistently across the shell,
Pi, and Neovim. Adjust opacity here, not separately per app; blur stays at 10.
Use opacity 1 for an opaque background.
Reload cmux's configuration, select `osaka-jade` in Pi's `/settings`, and restart Neovim
(or run `:colorscheme osaka-jade`) for existing sessions.

The original `woody` Pi and Neovim themes remain unchanged. The initial
switch also saved active settings under
`~/.config/theme-backups/woody-20260913-014121/` on this machine, including
Ghostty/cmux settings, Pi settings, and Neovim UI/cursor configuration.
Restore those files to recover the previous appearance, or select `woody`
in Pi and Neovim to switch just their palettes.

Checks: `nvim --headless -u NONE -l nvim/tests/osaka-jade.lua` and
`ghostty +validate-config` after terminal activation.

## Shell navigation

Install the shell dependencies with `brew install fzf zoxide zsh-autosuggestions`,
then open a new shell. `cd` uses zoxide to learn frequently visited directories;
`cdi` opens its fuzzy picker. Inline suggestions come from command history, not
zoxide's directory ranking. Pressing Enter on a partial directory name still
jumps to zoxide's best match. History is saved in `~/.zsh_history`.

Tab accepts a visible inline suggestion when the cursor is at the end of the
line; otherwise it performs normal completion. Enter still runs the command.

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

The footer layout patch puts model/branch on the left and reported cost plus
an opt-in five-cell context meter on the right. Mode/thinking live in the
input's top border, right-aligned with a near-white teal build gradient and
purple plan gradient, not duplicated in the footer. The context ball shares
the meter's color, including warning/critical states, and remains visible when
cost is hidden. Subscription cost is the provider-reported
estimate, not a subscription bill. DJ placement is unchanged.

After a powerline update, run `python3 pi/agent/patches/powerline-layout.py`,
then `/reload` in Pi. The installer also applies it. Changed or partial
upstream anchors stop without writing; do not force the patch through an
unreviewed update. Test with `bun test pi/agent/tests/powerline-layout-patch.test.ts`.

Pi uses a shared horizontal inset of roughly **2% per side** (at least one
column), rather than separate margins on the input and statusline. The host
patch keeps conversation output, tools, widgets, menus, and the footer inside
that viewport in regular and fullscreen modes. Ghostty, the shell, and Neovim
are unchanged. Raw CLI diagnostics and programs writing directly to the terminal
are not reflowed.

The editor patch adds the rounded `╭╮╰╯` frame without a second outer inset.
It reserves space before text wrapping and keeps scroll indicators,
completion rows, paste handling, and hardware cursor markers. Tiny terminals
fall back to the host editor. Mode/thinking labels interrupt the top border
near the right corner; when they cannot fit alongside the scroll hint, the
border keeps the hint and omits the labels. Working status stays outside the
box, within the shared viewport. Keep **pi-pretty before
powerline** in `settings.json`'s packages list: both install an editor during
`session_start`, and Pi awaits those handlers in package order. Powerline must
run last to retain the framed editor and bash controls; pretty's output
formatters remain active.

The host patch targets **Pi 0.84.2**; review it before upgrading Pi. To replay
the host and editor patches, run the following, then **restart Pi**;
`/reload` alone cannot reload the host renderer:

```sh
python3 pi/agent/patches/pi-horizontal-inset.py
python3 pi/agent/patches/powerline-editor.py
```

The installer applies the host inset before the editor patch. These guarded
patches follow the installed host's rendering contracts and refuse incompatible
sources rather than guessing. Rerun the real-host integration checks after updates:

```sh
PI_SDK_ROOT="$(npm root -g)/@earendil-works/pi-coding-agent" \
  bun test pi/agent/tests/pi-horizontal-inset-patch.test.ts \
    pi/agent/tests/powerline-editor-patch.test.ts
```

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
