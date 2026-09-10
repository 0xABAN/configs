---@type LazySpec
return {
  "AstroNvim/astrolsp",
  opts = {
    servers = { "clangd" },
    config = {
      clangd = {
        -- Project compile commands take precedence over these fallback flags.
        init_options = { fallbackFlags = { "-std=c++20" } },
      },
    },
  },
}
