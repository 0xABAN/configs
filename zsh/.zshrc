alias dev="cd ~/Projects"
alias code="zed"

alias cc="claude"
alias ccr="claude --resume"

alias p="pi"
alias oc="opencode"

alias gaa="git add --all"
alias gcl="git clone"
alias gs="git status"
alias gcm="git commit -m"
alias gps="git push"
alias gpl="git pull"

export EDITOR="zed --wait"

export PATH="$HOME/.local/bin:$PATH"
export PATH="/Library/Frameworks/Python.framework/Versions/3.12/bin:$PATH"
alias python=python3

PROMPT='%n @ mac %1~ %% '

# Google Cloud SDK
if [ -f "$HOME/.local/google-cloud-sdk/path.zsh.inc" ]; then
  . "$HOME/.local/google-cloud-sdk/path.zsh.inc"
fi
if [ -f "$HOME/.local/google-cloud-sdk/completion.zsh.inc" ]; then
  . "$HOME/.local/google-cloud-sdk/completion.zsh.inc"
fi

# Daytona completion (if installed)
if [ -f "$HOME/.daytona.completion_script.zsh" ]; then
  source "$HOME/.daytona.completion_script.zsh"
fi

gotd-smoke() {
  local release_date="${1:-2099-07-22}"
  local data_dir="${2:-/tmp/gotd-daytona-smoke}"
  (
    cd "$HOME/dev/vibe-check" || return
    uv run --project src/backend python -m src.backend.cli \
      --runtime daytona --artifact-only --real-smoke \
      --date "$release_date" --data-dir "$data_dir"
  )
}

# Launch two tModLoader clients (local multiplayer testing).
tml() {
  local tml_sh="$HOME/Library/Application Support/Steam/steamapps/common/tModLoader/start-tModLoader.sh"
  "$tml_sh" "$@" >/dev/null 2>&1 &
  "$tml_sh" "$@" >/dev/null 2>&1 &
  disown
}

# Kill all tModLoader clients started via tml / Steam.
tmlkill() {
  pkill -f 'tModLoader\.dll' 2>/dev/null
  pkill -f 'start-tModLoader\.sh' 2>/dev/null
}

# .NET SDK (tModLoader + CLI)
export DOTNET_ROOT="$HOME/.dotnet"
export PATH="$DOTNET_ROOT:$PATH"

# fzf
source <(fzf --zsh)

# machine-local secrets / overrides (not tracked)
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
