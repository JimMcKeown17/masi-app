import { deviceSettings } from '../services/deviceSettings';
import { CAPTURE_MODES } from '../constants/egraConstants';

/**
 * Resolve which capture screen to launch for a new assessment attempt.
 * Single owner of the capture-mode -> screen mapping: every entry point that starts an
 * assessment must route through this so the device toggle is honored everywhere. Reads the
 * mode fresh at launch time so a stale mount-loaded value can never route (or stamp) the wrong mode.
 */
export async function resolveAssessmentRoute() {
  const captureMode = await deviceSettings.getCaptureMode();
  return {
    screenName: captureMode === CAPTURE_MODES.SEQUENTIAL ? 'SequentialAssessment' : 'LetterAssessment',
    captureMode,
  };
}
