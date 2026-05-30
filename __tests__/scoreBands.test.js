import { getScoreBand, getBandColor } from '../src/utils/scoreBands';
import { colors } from '../src/constants/colors';

describe('getScoreBand — EGRA Letter Sounds raw-score bands', () => {
  const band = (rawScore, grade = 'Grade 1') =>
    getScoreBand({ toolCode: 'letter_sounds', grade, language: '*', rawScore });

  test('Grade 1 at the 40 LCPM benchmark bands as great', () => {
    expect(band(40)).toBe('great');
  });

  test('Grade 1 ladder bands each tier on its inclusive lower bound', () => {
    expect(band(39)).toBe('good');        // below great, at/above good_min 30
    expect(band(30)).toBe('good');
    expect(band(29)).toBe('okay');        // below good, at/above okay_min 20
    expect(band(20)).toBe('okay');
    expect(band(19)).toBe('needs_work');  // below okay_min
    expect(band(0)).toBe('needs_work');
  });

  test('grade keys the cuts — the same raw score bands differently by grade', () => {
    // 20 LCPM is the great benchmark for Grade R but only "okay" for Grade 1.
    expect(band(20, 'Grade R')).toBe('great');
    expect(band(20, 'Grade 1')).toBe('okay');
    // Grade R ladder: great >=20, good >=15, okay >=10, else needs_work.
    expect(band(15, 'Grade R')).toBe('good');
    expect(band(10, 'Grade R')).toBe('okay');
    expect(band(9, 'Grade R')).toBe('needs_work');
  });

  test('language resolves an explicit row first, then falls back to the * wildcard', () => {
    // Letter Sounds is language-independent (* row), so any language hits it.
    expect(band(40)).toBe('great');
    expect(
      getScoreBand({ toolCode: 'letter_sounds', grade: 'Grade 1', language: 'isixhosa', rawScore: 40 })
    ).toBe('great');

    // Injected table proves explicit-language precedence over a * row for the same key.
    const bands = [
      { tool_code: 'word_reading', grade: '1', language: '*', great_min: 50, good_min: 40, okay_min: 30 },
      { tool_code: 'word_reading', grade: '1', language: 'english', great_min: 100, good_min: 80, okay_min: 60 },
    ];
    const wr = (language, rawScore) =>
      getScoreBand({ toolCode: 'word_reading', grade: 'Grade 1', language, rawScore }, { bands });
    // 70 is "great" under the * row but only "okay" under the stricter explicit english row.
    expect(wr('english', 70)).toBe('okay');
    // A language with no explicit row falls back to the * wildcard row.
    expect(wr('isixhosa', 70)).toBe('great');
  });

  test('degrades safely to "unknown" — never crashes, never a misleading colour', () => {
    // Unconfigured (tool, grade, language) → neutral, not a guessed colour.
    expect(band(40, 'Grade 7')).toBe('unknown');           // grade with no row
    expect(getScoreBand({ toolCode: 'spelling', grade: 'Grade 1', rawScore: 40 })).toBe('unknown'); // tool with no row

    // Bad / missing raw score → unknown, no throw.
    expect(band(null)).toBe('unknown');
    expect(band(undefined)).toBe('unknown');
    expect(band(NaN)).toBe('unknown');
    expect(() => getScoreBand()).not.toThrow();
    expect(getScoreBand()).toBe('unknown');

    // Partly-configured row (good_min set, okay_min still pedagogy-TBD): a
    // below-good score cannot be told from needs_work, so it degrades to unknown.
    const bands = [
      { tool_code: 'story_writing', grade: '1', language: '*', great_min: 8, good_min: 6, okay_min: null },
    ];
    const sw = (rawScore) =>
      getScoreBand({ toolCode: 'story_writing', grade: 'Grade 1', language: '*', rawScore }, { bands });
    expect(sw(8)).toBe('great');     // backed cut still asserts
    expect(sw(6)).toBe('good');
    expect(sw(5)).toBe('unknown');   // below good, okay line TBD → neutral, not red
  });

  test('all go-live grades are seeded: 2 & 3 mirror Grade 1; ECD mirrors Grade R', () => {
    // Grades 2 and 3 share the Grade 1 ladder (great 40 / good 30 / okay 20).
    expect(band(40, 'Grade 2')).toBe('great');
    expect(band(30, 'Grade 2')).toBe('good');
    expect(band(19, 'Grade 2')).toBe('needs_work');
    expect(band(40, 'Grade 3')).toBe('great');
    expect(band(20, 'Grade 3')).toBe('okay');

    // ECD shares the Grade R ladder (great 20 / good 15 / okay 10).
    expect(band(20, 'ECD')).toBe('great');
    expect(band(10, 'ECD')).toBe('okay');
    expect(band(9, 'ECD')).toBe('needs_work');
  });
});

describe('getBandColor — band → swatch colour', () => {
  test('maps each band to a colour; great is a distinct green; unknown is neutral grey', () => {
    expect(getBandColor('good')).toBe(colors.success);
    expect(getBandColor('needs_work')).toBe(colors.emphasis);
    expect(getBandColor('unknown')).toBe(colors.disabled);
    // "great" is its own (darker) green, visually distinct from "good".
    expect(getBandColor('great')).not.toBe(getBandColor('good'));
    // "okay" is its own colour, distinct from the greens.
    expect(getBandColor('okay')).not.toBe(getBandColor('good'));
    expect(getBandColor('okay')).not.toBe(getBandColor('great'));
  });

  test('unmapped or missing band degrades to neutral grey, no crash', () => {
    expect(() => getBandColor()).not.toThrow();
    expect(getBandColor()).toBe(colors.disabled);
    expect(getBandColor('bogus')).toBe(colors.disabled);
  });
});
