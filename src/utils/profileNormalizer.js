import { JOB_TITLE_CODE_BY_NAME } from '../constants/jobTitles';

export function normalizeProfile(raw) {
  if (!raw) return null;

  const jobTitleName =
    raw.job_title_lookup?.name ?? raw.jobTitleName ?? raw.job_title ?? null;
  const jobTitleCode =
    raw.job_title_lookup?.code ??
    raw.jobTitleCode ??
    (jobTitleName ? JOB_TITLE_CODE_BY_NAME[jobTitleName] : null) ??
    null;

  return {
    ...raw,
    schoolName: raw.school_lookup?.name ?? raw.schoolName ?? raw.assigned_school ?? null,
    schoolId: raw.school_lookup?.id ?? raw.schoolId ?? raw.school_id ?? null,
    jobTitleName,
    jobTitleId: raw.job_title_lookup?.id ?? raw.jobTitleId ?? raw.job_title_id ?? null,
    jobTitleCode,
  };
}
