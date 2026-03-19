# AGENTS.md

## Repository rules
- This repository is a single npm workspace project rooted at the repository root.
- Never run dependency installation inside `node_modules/`.
- Never scan or edit files inside `node_modules/`, `dist/`, `build/`, `.next/`, or `.turbo/`.
- Install dependencies only from the repository root with the root lockfile.
- For backend tasks, prefer commands under the `server` workspace.
- For frontend tasks, prefer commands under the `web` workspace.
- Before concluding a task, use workspace-scoped commands where possible.