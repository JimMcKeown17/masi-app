# Agent Briefing: Documentation System

## Goal

Give humans useful product and engineering documents while giving agents a short, deterministic
route to the right source. Avoid copying the same status or contract into multiple files.

## Source roles

| Source | Owns | Must not own |
|---|---|---|
| `AGENTS.md` | stable repo rules and route to this index | detailed workstream history |
| `docs/agent-context/` | short task/workstream briefings and safe resumption points | full human narrative or duplicate contracts |
| `PRD.md` | current product, domain, feature, and quality requirements | task status, test counts, sprint logs |
| `CONTEXT.md` | canonical domain vocabulary and settled cross-cutting rules | implementation progress |
| `documentation/ROADMAP.md` | priority, dependencies, and all still-open work | completed implementation narrative |
| `documentation/build-log.md` | append-only verification, decisions, defects, and dead ends | current backlog |
| `documentation/device-gates-*` | checks only a real device or operator can perform | automated test history |
| `documentation/rls-sync-contract-map.md` | current table-by-table persistence/RLS/sync contract | dated design speculation |
| `documentation/*.md` | human-facing references, runbooks, teaching material, and active specs | agent-only handoff mechanics |
| `documentation/archive/` | dated, completed, superseded, or schema-dead evidence | current instructions or open work |
| GitHub issues | independently executable work | product/domain truth that belongs in standing docs |

## Question workflow

Before editing documentation, answer:

1. **Is this about the product as it should behave now?** Update PRD, CONTEXT, or a focused active
   specification.
2. **Is this still outstanding?** Update ROADMAP only.
3. **Did work run, pass, fail, or produce a durable decision?** Append to the build log.
4. **Is this a table/payload/RLS/order/reconcile change?** Update the contract map in the same
   branch.
5. **Can only a person or physical device verify it?** Add or update a device gate.
6. **Is this a dated plan or review whose remaining work has been rescued?** Archive it.
7. **Does an agent need a concise multi-document resumption path?** Add or update one briefing in
   this directory.

If the same fact seems to belong in two places, choose one owner and link to it from the other.

## Progressive-disclosure standard

A good agent briefing:

- begins with current status and the exact branch/artifact state;
- names the required source documents in reading order;
- lists locked decisions and dangerous assumptions;
- identifies what is on `main`, off `main`, deployed, or merely designed;
- gives the next safe action and verification gate;
- links to detail instead of reproducing it;
- stays short enough to read before implementation.

The briefing must be updated or retired when its branch topology, schema baseline, or next action
changes.

## Archive workflow

1. Inventory the candidate and all incoming/outgoing links.
2. Verify completion and staleness against current code, migrations, tests, build log, and live
   external state where relevant.
3. Rescue unresolved items into ROADMAP, open decisions, or a focused active spec.
4. Add a dated archive notice naming the replacement source.
5. Move the file with history preserved.
6. Rebase relative links for the deeper path.
7. Update `documentation/archive/README.md` and the human documentation map.
8. Run the Markdown link checker and `git diff --check`.
9. Append the audit result and exact verification to the build log.

## ADR boundary

Do not write an ADR for reversible filing or naming conventions. Use an ADR when documentation
reveals a hard-to-reverse system decision with real trade-offs, especially authorization, data
identity, migration compatibility, privacy, or cross-system ownership.

Current example: whole-class visibility for assessment/replacement versus assignment-scoped
delivery access needs an ADR before the group-centred workflow changes RLS or data exposure.
