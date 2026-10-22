// The roster an EA works from: their own children, minus hidden or archived ones.
// Every list, picker and lesson draws from this, so a hidden child never reappears in one place.
export const visibleRosterChildren = (children = []) => children.filter(child => !child.hidden_at && !child.archived_at);
