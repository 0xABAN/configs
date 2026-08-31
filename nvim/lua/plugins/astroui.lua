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
        -- match pi ash / cream peach diffs
        NeoTreeGitUntracked = { fg = "#ABC4AB" },
        NeoTreeGitAdded = { fg = "#ABC4AB" },
        NeoTreeGitModified = { fg = "#DCC9B6" },
        NeoTreeGitDeleted = { fg = "#ffd8c4" },
        GitSignsAdd = { fg = "#ABC4AB" },
        GitSignsChange = { fg = "#DCC9B6" },
        GitSignsDelete = { fg = "#ffd8c4" },
      },
    },
  },
}
