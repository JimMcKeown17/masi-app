/**
 * Decide how the Children tab should land an EA, based on the classes the EA has
 * children in (NOT the EA's programme). A single-class EA goes straight into that
 * class; everyone else sees the class list.
 *
 *   getChildrenLanding(classesWithChildren) -> { autoRoute, classId? }
 *
 * Pure: the caller computes which classes have the EA's children and handles the
 * actual navigation (auto-routing once per mount).
 */
export function getChildrenLanding(classesWithChildren) {
  const classes = classesWithChildren || [];
  if (classes.length === 1) {
    return { autoRoute: true, classId: classes[0].id };
  }
  return { autoRoute: false };
}
