export const GRADES = ['ECD', 'Grade R', 'Grade 1', 'Grade 2', 'Grade 3'];

export const HOME_LANGUAGES = ['isiXhosa', 'English', 'Afrikaans'];

export const GENDER_OPTIONS = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Unknown', value: 'unknown' },
];

export const GENDERS = GENDER_OPTIONS;

export const normalizeGender = (value) => {
  if (value == null || value === '') return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'f') return 'female';
  if (normalized === 'm') return 'male';
  return normalized;
};

export const getGenderLabel = (value) => (
  GENDER_OPTIONS.find(option => option.value === normalizeGender(value))?.label || ''
);
