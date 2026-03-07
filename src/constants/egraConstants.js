// EGRA (Early Grade Reading Assessment) Letter Sound subtest data.
// Letter sets sourced from documentation/egra_letter_sets.md.
// Important: English uses mixed case and digraphs — display as-is, do NOT force uppercase.

export const ENGLISH_LETTER_SET = {
  id: 'english_60',
  language: 'English',
  letters: [
    'I','a','m','E','p','n','L','s','o','e',
    'Y','i','K','N','d','H','f','U','h','v',
    'Z','b','G','r','J','T','c','F','q','W',
    'w','D','x','A','j','B','g','P','Q','y',
    'z','C','O','t','S','V','l','k','M','R',
    'X','u','X','d','ch','sh','th','wh','oo','ee',
  ],
  lettersPerPage: 20,
  columns: 5,
};

export const ISIXHOSA_LETTER_SET = {
  id: 'isixhosa_60',
  language: 'isiXhosa',
  letters: [
    'l','a','m','e','s','n','l','s','m','e',
    'y','i','k','n','d','h','f','u','h','v',
    'f','y','c','i','t','k','d','z','f','d',
    't','z','o','j','p','r','c','w','p','o',
    'w','a','e','x','q','l','g','o','u','z',
    'x','r','v','b','j','b','q','u','r','g',
  ],
  lettersPerPage: 20,
  columns: 5,
};

export const LETTER_SETS = { english: ENGLISH_LETTER_SET, isixhosa: ISIXHOSA_LETTER_SET };
export const ASSESSMENT_DURATION = 60; // seconds
