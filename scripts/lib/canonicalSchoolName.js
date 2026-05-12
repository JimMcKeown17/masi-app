function canonicalSchoolName(value) {
  if (!value) return null;
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

module.exports = {
  canonicalSchoolName,
};
