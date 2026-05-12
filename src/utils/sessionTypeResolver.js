import {
  JOB_TITLE_CODES,
  JOB_TITLE_NAME_BY_CODE,
} from '../constants/jobTitles';

const findByCode = (jobTitlesCache, code) => (
  jobTitlesCache.find(jobTitle => jobTitle.code === code)
);

const findByName = (jobTitlesCache, name) => {
  if (!name) return null;
  const normalizedName = name.trim().toLowerCase();
  return jobTitlesCache.find(
    jobTitle => jobTitle.name?.trim().toLowerCase() === normalizedName
  ) || null;
};

export const buildSessionTypeFields = ({
  profile,
  jobTitlesCache = [],
  fallbackCode = JOB_TITLE_CODES.LITERACY_COACH,
} = {}) => {
  const sessionTypeCode = profile?.jobTitleCode || fallbackCode;
  const sessionTypeName =
    profile?.jobTitleName || JOB_TITLE_NAME_BY_CODE[sessionTypeCode] || 'Literacy Coach';

  const resolvedId =
    profile?.jobTitleId ||
    findByCode(jobTitlesCache, sessionTypeCode)?.id ||
    findByName(jobTitlesCache, sessionTypeName)?.id ||
    null;

  const baseFields = {
    session_type: sessionTypeName,
  };

  if (resolvedId) {
    return {
      ...baseFields,
      session_type_id: resolvedId,
    };
  }

  return {
    ...baseFields,
    _pendingJobTitleResolve: true,
    pendingSessionTypeCode: sessionTypeCode,
    pendingSessionTypeName: sessionTypeName,
  };
};
