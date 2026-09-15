-- Run: nvim --headless -u NONE -l nvim/tests/leetcode.lua (requires c++)
dofile("nvim/plugin/leetcode.lua")

local function type_keys(keys)
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(keys, true, false, true), "xt", false)
end

local warning
vim.notify = function(message, level)
  assert(level == vim.log.levels.WARN)
  warning = message
end

-- Exercise the lowercase command as typed, not just the uppercase callback.
type_keys(":lc<CR>")
local scaffold = vim.api.nvim_buf_get_lines(0, 0, -1, false)
local source = table.concat(scaffold, "\n")
assert(vim.bo.filetype == "cpp", "must enable C++ syntax")
assert(source:find("class Solution {", 1, true), "must include Solution")
assert(source:find("int main() {", 1, true), "must include a local runner")
assert(source:find("Solution solution;", 1, true), "runner must instantiate Solution")
assert(vim.deep_equal(vim.api.nvim_win_get_cursor(0), { 10, 4 }), "cursor must land on the method placeholder")
local output = vim.fn.system({ "c++", "-std=c++17", "-x", "c++", "-fsyntax-only", "-" }, source)
assert(vim.v.shell_error == 0, output)

vim.cmd "Lc"
assert(warning == "LeetCode scaffold needs an empty buffer")
assert(vim.deep_equal(vim.api.nvim_buf_get_lines(0, 0, -1, false), scaffold), "must preserve existing code")

-- Even whitespace is existing content; empty special/protected buffers are not files.
for _, case in ipairs {
  { lines = { " " } },
  { lines = { "", "" } },
  { option = "buftype", value = "nofile" },
  { option = "modifiable", value = false },
  { option = "readonly", value = true },
} do
  vim.cmd "enew!"
  local lines = case.lines or { "" }
  vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
  local previous = case.option and vim.bo[case.option]
  if case.option then vim.bo[case.option] = case.value end

  warning = nil
  vim.cmd "Lc"
  assert(warning, "must warn rather than replace protected content")
  assert(vim.deep_equal(vim.api.nvim_buf_get_lines(0, 0, -1, false), lines), "must not change rejected buffers")
  assert(vim.bo.filetype == "", "must not change rejected filetypes")
  if case.option then vim.bo[case.option] = previous end
end

-- Expansion must not rename files or change the search term.
vim.cmd "enew!"
type_keys(":file lc<CR>")
assert(vim.fn.expand "%:t" == "lc", "arguments must remain lowercase")
vim.api.nvim_buf_set_lines(0, 0, -1, false, { "lc" })
type_keys("/lc<CR>")
assert(vim.fn.getreg "/" == "lc", "search patterns must remain lowercase")

print("LeetCode scaffold, C++ syntax, buffer protection, and lowercase alias checks passed")
