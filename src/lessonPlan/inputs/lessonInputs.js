import { getActiveAcademicYear, getActiveProgrammeId } from '../../db/repositories/domainRepositoryUtils';
import { PEDAGOGICAL_ORDERS, languageCodeForHomeLanguage } from '../../utils/assessmentRegistry';
import { compareGroups, getGroupDotColor, groupNumber, ungroupedChildren } from '../../utils/groupHelpers';
import { rankGroups, resolveLessonClass } from '../engine';
import { getPack, getPackById } from '../packs';
import { isPreviewContentEnabled } from '../packs/previewContent';
import { loadKnownLetters } from './knownLetters';
import { packIndexFor } from './packIndexCache';

const packFor = (languageCode, packId, allowPreview) => packId
  ? getPackById(packId, { allowPreview }) : getPack(languageCode, { allowPreview });

export const loadLessonBase = async ({ handle, repositories, today, programmeId }) => {
  const db = await handle.getReader();
  const programme = programmeId === undefined ? await getActiveProgrammeId(db, handle.userId) : programmeId;
  if (!programme) return { missing: 'programme' };
  const year = await getActiveAcademicYear(db);
  if (!year?.starts_on) return { missing: 'academic_year' };
  const sessions = await repositories.sessions.getSessions({
    userId: handle.userId, programmeId: programme, sinceDate: year.starts_on,
  });
  return { today, academicYearStart: year.starts_on, programmeId: programme, sessions };
};

const describeGroups = ({ groups, membersByGroup, classes }) => {
  const classesById = new Map(classes.map(row => [row.id, row]));
  return groups.map(group => {
    const members = membersByGroup[group.id] ?? [];
    const { classId } = resolveLessonClass({
      groupClassId: group.class_id, memberClassIds: members.map(child => child.class_id),
    });
    const lessonClass = classesById.get(classId);
    return { group, members, classId, languageCode: languageCodeForHomeLanguage(lessonClass?.home_language),
      isEcd: lessonClass?.grade === 'ECD' };
  });
};

const childInput = (child, knownLetters, historyByChild, masteryByChild) => ({
  id: child.id,
  readingLevel: child.reading_level ?? null,
  knownLetters: knownLetters ?? [],
  historyComplete: historyByChild[child.id] === true,
  masteryComplete: masteryByChild[child.id] === true,
});

const shapeResolvedPickerModel = ({ base, groups, descriptions, children, childrenGroups,
  knownLettersByLanguage = {}, historyByChild = {}, masteryByChild = {}, allowPreview = false }) => {
  const groupsById = new Map(descriptions.map(row => [row.group.id, row]));
  const engineGroups = descriptions.map(({ group, members, languageCode }) => ({
    id: group.id, name: group.name, displayNumber: groupNumber(group),
    memberIds: members.map(child => child.id), languageCode, pack: packFor(languageCode, null, allowPreview),
  }));
  const allChildren = Object.fromEntries(descriptions.flatMap(({ members }) => members.map(child => [
    child.id, childInput(child, [], historyByChild, masteryByChild),
  ])));
  const ranked = rankGroups({ ...base, groups: engineGroups, children: allChildren });
  const lettersByGroup = new Map();
  for (const languageCode of new Set(descriptions.map(row => row.languageCode))) {
    const languageGroups = engineGroups.filter(group => group.languageCode === languageCode);
    const languageChildren = Object.fromEntries(descriptions.filter(row => row.languageCode === languageCode)
      .flatMap(({ members }) => members.map(child => [child.id,
        childInput(child, knownLettersByLanguage[languageCode]?.[child.id], historyByChild, masteryByChild),
      ])));
    const result = rankGroups({ ...base, groups: languageGroups, children: languageChildren });
    for (const row of result.rows) lettersByGroup.set(row.groupId, row);
  }
  const dotIndices = new Map([...groups].sort(compareGroups).map((group, index) => [group.id, index]));
  return {
    upNextGroupId: ranked.upNextGroupId,
    rows: ranked.rows.map(row => {
      const { group, members, classId, languageCode, isEcd } = groupsById.get(row.groupId);
      const letters = lettersByGroup.get(row.groupId);
      return {
        groupId: group.id, name: group.name, number: groupNumber(group), dotColor: getGroupDotColor(dotIndices.get(group.id)),
        members: members.map(child => ({ id: child.id, firstName: child.first_name })),
        classId, languageCode, isEcd, lastSeenOn: row.lastSeenOn, taughtToday: row.taughtToday,
        nextLetters: letters.nextLetters, lettersReason: letters.lettersReason,
      };
    }),
    ungrouped: ungroupedChildren({ children, childrenGroups }),
    historyComplete: Object.values(allChildren).every(child => child.historyComplete),
  };
};

export const shapePickerModel = input => shapeResolvedPickerModel({
  ...input, descriptions: describeGroups(input),
});

export const loadPickerModel = async ({ handle, repositories, services, base, groups,
  getChildrenInGroup, children, childrenGroups }) => {
  const memberIdsByGroup = Object.fromEntries(groups.map(group => [group.id,
    [...new Set(getChildrenInGroup(group.id).map(child => child.id))],
  ]));
  const childIds = [...new Set(Object.values(memberIdsByGroup).flat())];
  const [childrenById, classes, historyByChild, masteryByChild] = await Promise.all([
    repositories.children.getChildrenByIds(childIds), repositories.classes.getClasses(),
    services.sessionHistory.completenessByChild({ childIds, programmeId: base.programmeId }),
    services.assessmentHistory.masteryCompletenessByChild({ childIds, programmeId: base.programmeId }),
  ]);
  const membersByGroup = Object.fromEntries(groups.map(group => [group.id,
    memberIdsByGroup[group.id].map(id => childrenById[id] ?? { id }),
  ]));
  const descriptions = describeGroups({ groups, membersByGroup, classes });
  const knownLettersByLanguage = Object.fromEntries(await Promise.all(
    [...new Set(descriptions.map(row => row.languageCode))].map(async languageCode => {
      const ids = [...new Set(descriptions.filter(row => row.languageCode === languageCode)
        .flatMap(row => row.members.map(child => child.id)))];
      return [languageCode, await loadKnownLetters({ repositories, userId: handle.userId, childIds: ids, languageCode })];
    })
  ));
  return shapeResolvedPickerModel({ base, groups, descriptions, children, childrenGroups,
    historyByChild, masteryByChild, knownLettersByLanguage, allowPreview: isPreviewContentEnabled() });
};

export const loadLessonParticipants = async ({ handle, repositories, services, programmeId,
  languageCode, packId, participantChildIds }) => {
  const childIds = [...new Set(participantChildIds)];
  const [childrenById, knownLetters, historyByChild, masteryByChild] = await Promise.all([
    repositories.children.getChildrenByIds(childIds),
    loadKnownLetters({ repositories, userId: handle.userId, childIds, languageCode }),
    services.sessionHistory.completenessByChild({ childIds, programmeId }),
    services.assessmentHistory.masteryCompletenessByChild({ childIds, programmeId }),
  ]);
  const pack = packFor(languageCode, packId, isPreviewContentEnabled());
  return {
    participants: childIds.map(id => childInput(childrenById[id] ?? { id }, knownLetters[id], historyByChild, masteryByChild)),
    pack, packIndex: packIndexFor(pack), alphabet: PEDAGOGICAL_ORDERS[languageCode] ?? null,
  };
};

export const presentLessonInput = ({ base, lesson, loaded, presentChildIds }) => {
  const byId = new Map(loaded.participants.map(child => [child.id, child]));
  return {
    ...base, groupId: lesson.groupId, upNextGroupId: lesson.upNextGroupId,
    languageCode: lesson.languageCode, isEcd: lesson.isEcd,
    pack: loaded.pack, packIndex: loaded.packIndex, alphabet: loaded.alphabet,
    presentChildren: presentChildIds.map(id => {
      if (!byId.has(id)) throw new Error(`Lesson participant facts missing: ${id}`);
      return byId.get(id);
    }),
  };
};
