---@type LazySpec
return {
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      filesystem = {
        filtered_items = {
          hide_dotfiles = false,
          hide_gitignored = false,
          hide_by_name = { ".git", ".DS_Store" },
        },
      },
    },
  },
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          files = { hidden = true, ignored = true },
          grep = { hidden = true, ignored = true },
        },
      },
    },
  },
}
