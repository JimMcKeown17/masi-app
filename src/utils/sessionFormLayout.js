// Uniform row geometry keeps FlatList offsets exact at every supported font scale.
export const rosterRowHeight = (fontScale) => Math.max(64, Math.ceil(20 + 2 + (22 + 18) * fontScale));
