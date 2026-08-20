-- AstroCore: options, mappings, features
-- docs: :h astrocore

---@type LazySpec
return {
  "AstroNvim/astrocore",
  ---@type AstroCoreOpts
  opts = {
    features = {
      large_buf = { size = 1024 * 256, lines = 10000 },
      autopairs = true,
      cmp = true,
      diagnostics = { virtual_text = true, virtual_lines = false },
      highlighturl = true,
      notifications = true,
    },
    diagnostics = {
      virtual_text = true,
      underline = true,
    },
    options = {
      opt = {
        relativenumber = true,
        number = true,
        spell = false,
        signcolumn = "yes",
        wrap = false,
        clipboard = "unnamedplus", -- yank → macOS clipboard
      },
    },
    mappings = {
      -- better-escape already maps jk → Esc; keep Mac word-delete
      i = {
        ["<M-BS>"] = { "<C-w>", desc = "Delete word backward" },
        ["<A-BS>"] = { "<C-w>", desc = "Delete word backward" },
      },
      c = {
        ["<M-BS>"] = { "<C-w>", desc = "Delete word backward" },
        ["<A-BS>"] = { "<C-w>", desc = "Delete word backward" },
      },
      n = {
        ["]b"] = { function() require("astrocore.buffer").nav(vim.v.count1) end, desc = "Next buffer" },
        ["[b"] = { function() require("astrocore.buffer").nav(-vim.v.count1) end, desc = "Previous buffer" },
      },
    },
  },
}
