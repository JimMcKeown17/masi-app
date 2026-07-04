// Compat shim: time tracking is a single-truth context now. Existing import
// paths (and the screen tests that mock this module path) stay valid.
export { useTimeTracking } from '../context/TimeTrackingContext';
