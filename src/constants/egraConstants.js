// EGRA (Early Grade Reading Assessment) Letter Sound subtest data.
// Letter sets sourced from documentation/egra_letter_sets.md.
// Important: English uses mixed case and digraphs — display as-is, do NOT force uppercase.

export const ENGLISH_LETTER_SET = {
  id: 'english_60',
  language: 'English',
  type: 'letter',
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
  type: 'letter',
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

// --- Word Reading Assessment sets (EGRA) ---
// Placeholder word lists — replace with real EGRA word lists when available.

export const ENGLISH_WORD_SET = {
  id: 'english_words_50',
  language: 'English',
  type: 'word',
  letters: [
    'the','and','is','it','to','in','he','was','on','at',
    'his','but','not','you','all','can','had','her','one','our',
    'out','day','get','has','him','how','its','may','new','now',
    'old','see','two','way','who','did','let','say','she','too',
    'any','big','end','far','got','hand','help','just','long','make',
  ],
  lettersPerPage: 10,
  columns: 2,
};

export const ISIXHOSA_WORD_SET = {
  id: 'isixhosa_words_50',
  language: 'isiXhosa',
  type: 'word',
  letters: [
    'inja','amanzi','umama','ubaba','indlu','isikolo','umntana','inkomo','intaka','ilanga',
    'inyoka','imbali','isisu','ubuso','umlomo','amehlo','indlela','isango','ilitye','umthi',
    'inkwenkwe','intombi','inyama','isonka','ubisi','itafile','isitulo','incwadi','ipensile','ibhola',
    'ikatsu','inguruma','isiketi','ibhatyi','ihempe','ibhulukhwe','umnqwazi','izihlangu','unyawo','isandla',
    'indlebe','impumlo','intloko','amadolo','imilenze','iminwe','amazinyo','ulwimi','isikhalo','uthando',
  ],
  lettersPerPage: 10,
  columns: 2,
};

export const WORD_SETS = { english: ENGLISH_WORD_SET, isixhosa: ISIXHOSA_WORD_SET };

export function getLetterSetById(id) {
  return Object.values(LETTER_SETS).find((s) => s.id === id) || null;
}

/** Look up any assessment set (letter or word) by its id. */
export function getItemSetById(id) {
  return Object.values(LETTER_SETS).find((s) => s.id === id)
    || Object.values(WORD_SETS).find((s) => s.id === id)
    || null;
}
