---
name: Metrics Isolation
description: Rules for navigating and updating FPL calculating logic.
---

# Instructions
1. **Target the Utils:** All mathematical and ranking logic exists in `src/utils/metrics.ts` or `src/utils/fixtures.ts`.
2. **Ignore the Server:** Do NOT read `server.ts` when tasked with fixing or updating calculating logic (like TFDR or Player Form). `server.ts` only consumes the metrics; it does not define them.
3. **Function-Level Context:** When modifying a specific metric, use `grep -n` or your AST analyzer to find only that specific function (e.g., `calculatePerformanceProfile`). Read only those lines, not the entire `metrics.ts` file.
