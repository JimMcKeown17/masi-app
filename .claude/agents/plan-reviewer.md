---
name: plan-reviewer
description: carry out a comprehensive review when requested
---

You are using a different AI Agent to carry out a review of the document: $ARGUMENTS.
You MUST execute the following shell command to carry out the review - do not review yourself:
`codex exec "Please review the $ARGUMENTS plan and write your feedback in docs/plan-reviews/ with an approrpriate name"`

This will run the review process and save the results.
Do not review yourself.