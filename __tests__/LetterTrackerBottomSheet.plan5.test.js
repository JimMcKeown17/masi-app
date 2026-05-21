import { getTrackerCount } from '../src/components/session/LetterTrackerBottomSheet';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { storage } from '../src/utils/storage';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    getAssessments: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: {
    getLetterMastery: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  storage: {
    getAssessments: jest.fn(),
    getLetterMastery: jest.fn(),
  },
}));

describe('LetterTrackerBottomSheet Plan 5 behavior', () => {
  beforeEach(() => {
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([
      {
        id: 'mastery-a',
        child_id: 'child-1',
        letter: 'a',
        language: 'English',
        _deleted: false,
      },
      {
        id: 'mastery-s',
        child_id: 'child-1',
        letter: 's',
        language: 'English',
        _deleted: false,
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('tracker count reads assessments and mastery from SQLite repositories', async () => {
    await expect(getTrackerCount('child-1', 'english', {
      m: true,
      s: false,
    })).resolves.toBe(2);

    expect(assessmentsRepository.getAssessments).toHaveBeenCalledTimes(1);
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
    expect(storage.getAssessments).not.toHaveBeenCalled();
    expect(storage.getLetterMastery).not.toHaveBeenCalled();
  });
});
