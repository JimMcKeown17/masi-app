export const isGroupMastered = (covered, present) => {
  if (present <= 0) return false;
  if (present < 3) return covered === present;
  return 5 * covered >= 4 * present || present - covered <= 1;
};
