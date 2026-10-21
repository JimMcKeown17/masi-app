export const resolveLessonClass = ({ groupClassId, memberClassIds }) => {
  if (groupClassId != null) return { classId: groupClassId, choices: [] };

  const choices = [...new Set(memberClassIds.filter((classId) => classId != null))];
  return choices.length === 1
    ? { classId: choices[0], choices: [] }
    : { classId: null, choices };
};
