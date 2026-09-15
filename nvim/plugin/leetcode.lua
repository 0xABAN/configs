vim.api.nvim_create_user_command("Lc", function()
  if vim.bo.buftype ~= "" or not vim.bo.modifiable or vim.bo.readonly then
    vim.notify("LeetCode scaffold needs an editable file buffer", vim.log.levels.WARN)
    return
  end

  if vim.api.nvim_buf_line_count(0) ~= 1 or vim.api.nvim_buf_get_lines(0, 0, 1, false)[1] ~= "" then
    vim.notify("LeetCode scaffold needs an empty buffer", vim.log.levels.WARN)
    return
  end

  vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split([[#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

using namespace std;

class Solution {
public:
    // Your method here
};

int main() {
    Solution solution;
    return 0;
}]], "\n"))
  vim.bo.filetype = "cpp"
  vim.api.nvim_win_set_cursor(0, { 10, 4 })
end, { desc = "Scaffold a C++ LeetCode solution and main in an empty buffer" })

-- User commands must start uppercase. Alias only the exact :lc command,
-- leaving search patterns and arguments such as :edit lc unchanged.
vim.cmd [[cnoreabbrev <expr> lc getcmdtype() == ':' && getcmdline() == 'lc' ? 'Lc' : 'lc']]
