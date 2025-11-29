This monorepo contains the documentation and implementation of ALC-244 (Linear): Local-first event-sourced zero-knowledge sync architecture POC.

Read @goals-poc-prd-v2.md for the full PRD of what we're working on here.

Key rules:

- Break down work as subtasks under ALC-244 using the Linear MCP tools.
- Follow the progress of each task by regularly committing and submitting comments what was achieved so far and what were the challenges.
- Make a branch per subissue and use short conventional commit messages.
- Execute professionally. No cutting corners!!! This POC will grow into a production app and there must be no crap.
- Use TypeScript as it must be used. NEVER, EVER USE `any`! Do not cast unless well justified!
- In case of blocking issues and PRD divergence you can't reconcile – stop and ask.
- Make sure to thoroughly test and review each subtask before continuing. Prefer TDD.
- Use the docker compose stack to run and debug the app, and run e2e tests.
- Lint, typecheck, prettify before you declare something is ready.
