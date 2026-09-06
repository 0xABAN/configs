---@type LazySpec
return {
  {
    "AstroNvim/astrocore",
    opts = function(_, opts)
      for _, mode in ipairs { "n", "v", "i" } do
        for _, key in ipairs { "<Up>", "<Down>", "<Left>", "<Right>" } do
          opts.mappings[mode][key] = "<Nop>"
        end
      end
    end,
  },
  {
    "saghen/blink.cmp",
    opts = { keymap = { ["<Up>"] = false, ["<Down>"] = false } },
  },
}
