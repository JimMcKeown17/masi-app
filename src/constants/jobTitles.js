export const JOB_TITLES = {
  LITERACY_COACH: 'Literacy Coach',
  NUMERACY_COACH: 'Numeracy Coach',
  ZZ_COACH: 'ZZ Coach',
  YEBONEER: 'Yeboneer',
  ONE_THOUSAND_STORIES: '1000 Stories',
};

export const JOB_TITLES_ARRAY = Object.values(JOB_TITLES);

export const JOB_TITLE_CODES = {
  LITERACY_COACH: 'literacy_coach',
  NUMERACY_COACH: 'numeracy_coach',
  ZZ_COACH: 'zz_coach',
  YEBONEER: 'yeboneer',
  ONE_THOUSAND_STORIES: 'one_thousand_stories',
};

export const JOB_TITLE_NAME_BY_CODE = {
  [JOB_TITLE_CODES.LITERACY_COACH]: JOB_TITLES.LITERACY_COACH,
  [JOB_TITLE_CODES.NUMERACY_COACH]: JOB_TITLES.NUMERACY_COACH,
  [JOB_TITLE_CODES.ZZ_COACH]: JOB_TITLES.ZZ_COACH,
  [JOB_TITLE_CODES.YEBONEER]: JOB_TITLES.YEBONEER,
  [JOB_TITLE_CODES.ONE_THOUSAND_STORIES]: JOB_TITLES.ONE_THOUSAND_STORIES,
};

export const JOB_TITLE_CODE_BY_NAME = Object.fromEntries(
  Object.entries(JOB_TITLE_NAME_BY_CODE).map(([code, name]) => [name, code])
);
