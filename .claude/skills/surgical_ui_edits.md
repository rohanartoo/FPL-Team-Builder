---
name: Surgical UI Edits
description: Strict guidelines for editing React components in the tabs directory to minimize output tokens.
---

# Instructions
1. **No Full File Rewrites:** When modifying files in `src/components/tabs/` (e.g., `H2HMatchupTab.tsx`, `TeamScheduleTab.tsx`), do NOT output the entire file in your response.
2. **Targeted Editing:** Use `sed`, `awk`, or specific search-and-replace tools to modify Tailwind classes or TSX logic inline.
3. **Diff-Only Output:** If you must use a replace tool, only select the specific `[start_line, end_line]` containing the JSX element you are modifying. 
4. **Preserve Sub-components:** Do not refactor massive UI files into smaller components unless explicitly instructed to by the user. Keep functional changes localized to their existing functions.
