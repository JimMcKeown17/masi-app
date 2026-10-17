---

name: codex-first
description: "Claude/Fable plans and verifies; Codex builds scoped implementation."
-----------------------------------------------------------------------------------

# Codex First

Claude Code sessions only. If running inside Codex or any non-Claude harness, skip this skill; never self-delegate.

## Principle

Claude/Fable owns judgment: product intent, architecture, API design, UX, naming, specs, review, verification, and risky external actions.

Codex owns execution: scoped implementation, mechanical edits, codebase exploration, test writing, refactors, migrations, and bug-fix iterations after the spec is frozen.

The goal is not “Codex always.” The goal is:

> Claude thinks. Codex types. Claude reviews.

## Route

Delegate to Codex by default for hands-on implementation when the work is non-trivial and the spec is clear.

Use Codex for:

* implementation from a frozen spec
* bug fixes with a known repro
* refactors and mechanical migrations
* test writing and coverage fills
* CI fixes, dependency bumps, scripts, tooling
* broad codebase exploration where raw reading is most of the work
* repetitive edits across many files

Keep in Claude for:

* design, architecture, API shape, naming, UX judgment
* ambiguous tasks where writing the spec is the real work
* tiny edits, roughly fewer than 20 lines, where delegation overhead loses
* tasks requiring MCP/browser/computer-use/session tools
* secrets, 1Password, credentials, production keys, or private consoles
* destructive or irreversible operations
* releases, pushes, deploys, GitHub mutations, database mutations
* review of Codex output — never delegated, never skipped

Mixed task: Claude designs first, freezes the spec, then delegates build-out.

Heuristic:

* If the prompt already reads like a work order, delegate.
* If writing the work order forces decisions, stay in Claude until the decisions are made.

Portfolio or multi-repo orchestration: use `$maintainer-orchestrator` instead.

## Preferred invocation: Claude Code plugin

Use the Codex plugin for normal delegated implementation.

Despite the name, `/codex:rescue` is the plugin’s “hand this problem to Codex” command.

```text
/codex:rescue --background <clear work order>
```

Use background mode for anything that may take a while.

Check progress and results with:

```text
/codex:status
/codex:result
```

Continue the same Codex thread for follow-up fixes:

```text
/codex:rescue --resume <specific follow-up instruction>
```

Use review commands only for review:

```text
/codex:review --background
/codex:adversarial-review --background <specific risk area or design concern>
```

Do not confuse review with implementation:

* `/codex:review` = read-only code review
* `/codex:adversarial-review` = read-only challenge review
* `/codex:rescue` = delegated investigation/fix/build work

Avoid enabling the review gate by default. It can create long Claude/Codex loops and burn usage. Use it only when actively supervised.

## Raw CLI fallback: `codex exec`

Use raw `codex exec` instead of the plugin when you need exact flags, prompt-file discipline, output capture, parallel jobs, or behavior outside the plugin wrapper.

Prompt via temp file. Do not inline large quoted prompts.

```bash
P=$(mktemp); cat >"$P" <<'EOF'
Goal:
<what Codex should accomplish>

Repo:
<absolute or relative repo path>

Relevant paths:
- <path 1>
- <path 2>

Current behavior:
<what happens now>

Desired behavior:
<what should happen instead>

Constraints:
- <do not touch X>
- <preserve Y>
- <smallest safe patch unless told otherwise>

Non-goals:
- <explicitly out of scope>

Proof expected:
<exact test/lint/typecheck/build command Codex should run>

Output shape:
Report:
1. files changed
2. summary of approach
3. commands run and exact results
4. any risks, skipped tests, or unfinished items
EOF

command codex exec -C <repo> \
  --sandbox workspace-write \
  --ask-for-approval never \
  -c model_reasoning_effort="high" \
  -o /tmp/codex-last.md \
  - <"$P" 2>/dev/null
```

Read `/tmp/codex-last.md` for the final result. Do not parse the JSONL stream unless specifically needed.

If `command codex` is not on PATH, try:

```bash
fnm exec --using default -- codex exec -C <repo> \
  --sandbox workspace-write \
  --ask-for-approval never \
  -c model_reasoning_effort="high" \
  -o /tmp/codex-last.md \
  - <"$P" 2>/dev/null
```

Use `2>/dev/null` to suppress thinking/noise. Remove it only when debugging a failing run.

For work outside a git repository, add:

```bash
--skip-git-repo-check
```

## Sandbox policy

Default to:

```bash
--sandbox workspace-write
```

Use this for unattended local work that should stay inside the repository.

Do not use `--yolo` casually.

`--yolo` / `--dangerously-bypass-approvals-and-sandbox` is allowed only when all are true:

* running in a disposable worktree, container, VM, or otherwise hardened environment
* no secrets are available in the environment
* no important uncommitted work is present
* the prompt is tightly scoped to the target repo
* the task genuinely needs permissions that `workspace-write` cannot provide

Prefer `--add-dir` for additional write roots instead of broad machine access.

If Codex fails because it needs network, credentials, or outside-repo access, do not immediately jump to `--yolo`. Either adjust the task, run the needed setup manually in Claude, or switch to an explicitly supervised workflow.

## Follow-up fixes

Prefer follow-up/resume over fresh runs. It is cheaper and preserves Codex’s local task context.

Plugin path:

```text
/codex:rescue --resume <specific correction or next step>
```

Raw CLI path:

```bash
P2=$(mktemp); cat >"$P2" <<'EOF'
Follow-up:
<what was wrong or incomplete>

Required fix:
<exact correction>

Proof expected:
<exact command to run>

Output shape:
Report files changed, commands run, exact results, and remaining risks.
EOF

(cd <repo> && command codex exec resume --last \
  -o /tmp/codex-last.md \
  - <"$P2" 2>/dev/null)
```

After two failed Codex rounds, Claude takes over directly.

## Prompt contract

Codex starts with zero Claude session context unless using a plugin resume/CLI resume thread.

Every fresh prompt must include:

* goal
* repo and key paths
* current behavior
* desired behavior
* constraints
* non-goals
* exact proof expected
* output shape

Spec quality decides success. Do not delegate vague intent and expect good implementation.

Bad prompt:

```text
Fix the dashboard.
```

Good prompt:

```text
In the Next.js app at <repo>, fix the dashboard loading state in app/dashboard/page.tsx and related components. The current page flashes "No data" before the query resolves. Preserve the existing data model and visual layout. Do not touch auth or navigation. Add or update tests if an existing test pattern is nearby. Run npm run lint and npm test -- --runInBand. Report files changed, commands run, and exact results.
```

## Verification: Claude always

After Codex finishes, Claude must verify before ship.

Minimum verification:

```bash
git status -sb
git diff
```

Then:

* read the full diff like a contributor PR
* confirm the implementation matches the spec
* check for unnecessary rewrites or scope creep
* check for secrets, env changes, destructive commands, or generated junk
* run focused tests personally when feasible
* treat Codex’s claimed test results as advisory, not proof
* ask Codex for follow-up fixes via resume when useful
* after two failed rounds, stop delegating and fix directly
* run `$autoreview` before final ship when normal closeout rules call for it

Never skip Claude-side review.

## Economics

The win is moving generation, exploration, and mechanical implementation tokens to Codex while preserving Claude/Fable context for judgment and verification.

Do not ping-pong trivia through delegation.

Do not delegate tiny obvious edits.

Do delegate work that would otherwise consume large Claude context through reading, patching, testing, and iteration.
