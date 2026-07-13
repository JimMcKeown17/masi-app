import { resolveAssessmentRoute } from '../src/utils/assessmentRouting';
import { deviceSettings } from '../src/services/deviceSettings';

jest.mock('../src/services/deviceSettings');

describe('resolveAssessmentRoute', () => {
  test('sequential -> SequentialAssessment screen, mode echoed', async () => {
    deviceSettings.getCaptureMode.mockResolvedValue('sequential');
    expect(await resolveAssessmentRoute()).toEqual({ screenName: 'SequentialAssessment', captureMode: 'sequential' });
  });

  test('grid -> LetterAssessment screen, mode echoed', async () => {
    deviceSettings.getCaptureMode.mockResolvedValue('grid');
    expect(await resolveAssessmentRoute()).toEqual({ screenName: 'LetterAssessment', captureMode: 'grid' });
  });
});
