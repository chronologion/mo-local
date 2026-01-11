This monorepo contains the documentation and implementation of MO Local: a system built using a local-first event-sourced zero-knowledge sync architecture.

See `README.md` for an overview of the repo structure and getting started.

Key rules:

- Use Linear MCP tools to read and edit issues.
- If the Linear ticket has a label "Needs RFC", ensure that an RFC is prepared and approved before producing any code.
- Follow the progress of each task by regularly committing and submitting comments to the Linear issue you're working on on what was achieved so far and what were the challenges.
- Make a branch per Linear subissue and use short, one-line conventional commit messages per layer, don't create mega-commits with the whole change across all layers, no co-author!
- Execute professionally. No cutting corners! This is production-grade software.
- Use TypeScript as it must be used. NEVER, EVER USE `any`! Do not cast unless well justified!
- NEVER "hand-code" dependency versions in `package.json`! Just install latest, unless there's a reason not to, but you must justify and get approval first.
- Follow DDD layering and split responsibilities according to best practices! Domain is core without dependencies. Commands and Queries are lean objects, no logic. Handlers have the logic.
- When discussing architecture topics, understand `docs/architecture.md` first and record any significant decisions there. But don't casually read this document for every little bug fix as it's a large document and will consume a lot of context!
- Domain classes – aggregates, entities and domain events – use VOs for their members. We have a "no primitive types" obsessions!
- In case of blocking issues and PRD divergence you can't reconcile – stop and ask.
- Make sure to thoroughly test and review each subtask before continuing. Prefer TDD.
- Tests are located in `__tests__` on the same level as `src` for each app/module.
- Use the `yarn` scripts and control the Docker compose stack to run & debug the app, and run e2e tests.
- ALWAYS lint, typecheck, prettify and RUN your tests before you declare something is ready.
- Before you concludue work, make sure that the references of the current Linear issue ID in the documentation are resolved.
- For each completed task, make a PR with a proper markdown summary using `gh`. Wait for review and fix any reported issues.
- The title of the PR must include a list of the Linear issues and a summary, e.g. "ALC-123, ALC-124: This is a PR title". Capitalize the first letter of the summary.
- In PR descriptions, you MUST keep the original PR template, use proper markdown, wrap code identifiers, filenames, and commands in backticks.
- Use the Context7 MCP tools or web search in case you need to RTFM!
