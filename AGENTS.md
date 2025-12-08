This monorepo contains the documentation and implementation of ALC-244 (Linear): Local-first event-sourced zero-knowledge sync architecture POC.

Read @goals-poc-prd-v2.md for the full PRD of what we're working on here.

Key rules:

- Use Linear MCP tools to read and edit issues.
- Follow the progress of each task by regularly committing and submitting comments to the Linear issue you're working on on what was achieved so far and what were the challenges.
- Make a branch per Linear subissue and use short conventional commit messages.
- Execute professionally. No cutting corners!!! This POC will grow into a production app and there must be no crap.
- Use TypeScript as it must be used. NEVER, EVER USE `any`! Do not cast unless well justified!
- Don't "hand-code" dependency versions in package.json! Just install latest, unless there's a reason not to.
- Follow DDD/clean architecture layering and split responsibilities according to best practices! Domain is core without dependencies. Commands and Queries are lean objects, no logic. Handlers have the logic.
- In case of blocking issues and PRD divergence you can't reconcile – stop and ask.
- Make sure to thoroughly test and review each subtask before continuing. Prefer TDD.
- Tests are located in `__tests__` on the same level as `src` for each app/module.
- Use the docker compose stack to run and debug the app, and run e2e tests.
- Lint, typecheck, prettify before you declare something is ready.
- For each completed task, make a PR with a proper markdown summary using `gh`. Wait for review and fix any reported issues.
- Use the Context7 MCP tools or web search in case you need to RTFM!
