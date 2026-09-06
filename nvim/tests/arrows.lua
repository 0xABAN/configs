-- Run: nvim --headless -u NONE -l nvim/tests/arrows.lua
local specs = dofile("nvim/lua/plugins/arrows.lua")
local opts = { mappings = { n = {}, v = {}, i = {}, c = {}, t = {} } }
opts.mappings.n["<M-Left>"] = "b"
specs[1].opts(nil, opts)
for mode, maps in pairs(opts.mappings) do
  for key, rhs in pairs(maps) do
    vim.keymap.set(mode, key, rhs)
  end
end
for _, mode in ipairs { "n", "x", "s", "i", "c", "t" } do
  for _, key in ipairs { "<Up>", "<Down>", "<Left>", "<Right>" } do
    local expected = (mode == "c" or mode == "t") and "" or "<Nop>"
    assert(vim.fn.maparg(key, mode) == expected, mode .. key)
  end
end
assert(vim.fn.maparg("<M-Left>", "n") == "b")
assert(specs[2].opts.keymap["<Up>"] == false)
assert(specs[2].opts.keymap["<Down>"] == false)
print("arrow mapping checks passed")
