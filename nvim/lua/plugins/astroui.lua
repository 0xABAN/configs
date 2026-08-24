-- AstroUI: colorscheme + highlight overrides
-- docs: :h astroui

---@type LazySpec
return {
  "AstroNvim/astroui",
  ---@type AstroUIOpts
  opts = {
    colorscheme = "cream-red",
    highlights = {
      -- force transparent panes so Ghostty/cmux opacity shows through
      init = {
        Normal = { bg = "NONE" },
        NormalNC = { bg = "NONE" },
        NormalFloat = { bg = "NONE" },
        SignColumn = { bg = "NONE" },
        EndOfBuffer = { bg = "NONE" },
        StatusLine = { bg = "NONE" },
        StatusLineNC = { bg = "NONE" },
        TabLine = { bg = "NONE" },
        TabLineFill = { bg = "NONE" },
        WinBar = { bg = "NONE" },
        WinBarNC = { bg = "NONE" },
        -- untracked git files in neo-tree (was orange)
        NeoTreeGitUntracked = { fg = "#7aad6f" },
      },
    },
  },
}
