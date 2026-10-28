---
status: accepted
date: 2026-10-23
---

# Lesson advice comes from the children present; the record belongs to the group

## Context

A literacy lesson is taught to one group, usually a pair, but on any day a child can be absent or
added for the day from elsewhere. Two questions follow, and they have different answers. **Whose
needs should shape today's teaching?** And **what does the saved session say happened, and to
whom does it belong?** A reader of the code sees advice computed over `presentChildIds`, a session
saved with the group's `group_id` and the lesson's fixed `class_id`, and no absent rows. Without
this record, they would reasonably ask why advice and record use different sets of children.

## Decision

**Advice comes from the children present** (lesson-plan spec C1, J7). Suggested letters, the
default blend tier (the lowest present child's), the suggested book, review letters and the
first-lesson rule are all computed over the children marked here. Marking a child absent before
the first tick recomputes the advice on the lesson's own day; after the first tick the plan is
frozen (C14). An absent partner never sets today's level, and when they return their own gaps
shape that lesson: in a pair a letter counts as known only when both present children know it
(at least 80% for three or more, spec §4.4).

**The record belongs to the group.** The saved session carries the group's `group_id`, the class
fixed when the lesson started (C18), and as attendees **only the children present** (C13). A child
added for the day is an attendee of this group's session and is taught, with tracker marks saved,
in the lesson's language. Their group membership does not change.

**Absence is derived, never stored** (Jim, 2026-10-23). "Lulu missed Monday" is worked out from
the group's membership on that date (memberships keep join and removal dates), not from an absent
row or an absent list. This keeps every existing count that reads attendees (history cards, the
receipt, rankings) unchanged.

**Last seen follows the children** (Jim, 2026-10-23). A group's last seen, and so its place in Up
next, is the most recent lesson this school year in this programme that **any** of its current
children attended, with any group or EA. A child added to another group's lesson moves their own
group down the ranking even though their partner was not taught. That is accepted: advice follows
the children, and adding a child for the day is the exception.

## Consequences

- Attendance reporting for head office or funders must compute "expected" from membership history
  on the session date (`child_group_memberships.joined_at` / `removed_at`), not from attendee rows
  alone. Children added for the day appear as attendees of a group they are not members of.
- `activities.lesson.plan.present_child_ids` records whose needs the saved plan answered; it can
  differ from the group's membership and, after a post-freeze attendance change, from the attendees.
- One rule each, shared by every screen: the visible roster (`visibleRosterChildren`) and last seen
  (`groupLastSeenOn`) are single functions, because review found each drifting when kept in two
  places.

## Considered alternatives

- **Advice from the whole group, absent children included.** Rejected: an absent partner would set
  the level and letters for a child taught alone.
- **Save absent children** as an absent list in `activities.lesson`, or as attendee rows with
  `present = false`. Rejected for now: membership history already answers the question, and absent
  rows would change every attendee count. An absent list stays a cheap addition if reporting ever
  needs it.
- **Last seen from this group's own sessions only, or only when every child attended.** Rejected:
  the first ignores lessons a child had elsewhere; the second leaves a pair with one long-absent
  child looking never seen.
