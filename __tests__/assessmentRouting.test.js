import { resolveAssessmentRoute } from '../src/utils/assessmentRouting';
import { storage } from '../src/utils/storage';

jest.mock('../src/utils/storage');

describe('resolveAssessmentRoute', () => {
  test('sequential -> SequentialAssessment screen, mode echoed', async () => {
    storage.getCaptureMode.mockResolvedValue('sequential');
    expect(await resolveAssessmentRoute()).toEqual({ screenName: 'SequentialAssessment', captureMode: 'sequential' });
  });

  test('grid -> LetterAssessment screen, mode echoed', async () => {
    storage.getCaptureMode.mockResolvedValue('grid');
    expect(await resolveAssessmentRoute()).toEqual({ screenName: 'LetterAssessment', captureMode: 'grid' });
  });
});
