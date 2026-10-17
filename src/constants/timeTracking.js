// src/constants/timeTracking.js
// Shared by the time-tracking provider (auto clock-out) and the Home attention
// copy ("Clocked out after 10 hours"), so the number lives in one place.
export const MAX_SHIFT_HOURS = 10;
export const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;
