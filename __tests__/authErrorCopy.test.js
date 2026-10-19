import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describeAuthError } from '../src/utils/authErrorCopy';

const signInFallback = 'Couldn’t sign in. Please try again.';
const resetFallback = 'Couldn’t send the reset link. Please try again.';
const paused = 'Your access is paused. Please contact your supervisor.';
const network = 'Couldn’t reach Masi. Check your internet connection and try again.';
const server = 'Masi isn’t responding right now. Please try again in a few minutes.';
const rate = 'Too many attempts. Please wait a few minutes and try again.';

test.each([
  [new AuthApiError('User is banned', 400, 'user_banned'), 'sign_in', paused],
  [new AuthApiError('User is banned', 400, 'user_banned'), 'reset', resetFallback],
  [{ message: 'User is banned' }, 'sign_in', paused],
  [{ message: 'User is banned' }, 'reset', resetFallback],
  [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'sign_in', 'Invalid login credentials'],
  [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'reset', resetFallback],
  [new AuthRetryableFetchError('Network request failed', 0), 'sign_in', network],
  [new AuthRetryableFetchError('Network request failed', 0), 'reset', network],
  [new AuthRetryableFetchError('Bad gateway', 502), 'sign_in', server],
  [new AuthRetryableFetchError('Bad gateway', 502), 'reset', server],
  [new AuthApiError('x', 429, 'over_request_rate_limit'), 'sign_in', rate],
  [new AuthApiError('x', 429, 'over_request_rate_limit'), 'reset', rate],
  [new AuthApiError('x', 429, 'over_email_send_rate_limit'), 'sign_in', signInFallback],
  [new AuthApiError('x', 429, 'over_email_send_rate_limit'), 'reset', 'Too many reset emails were requested. Please wait a while and try again.'],
  [new Error('Something raw'), 'sign_in', signInFallback],
  [new Error('Something raw'), 'reset', resetFallback],
  [undefined, 'sign_in', signInFallback],
  [undefined, 'reset', resetFallback],
  [null, 'sign_in', signInFallback],
  [null, 'reset', resetFallback],
  [{ message: 'Bad gateway', status: 502 }, 'sign_in', signInFallback],
  [new AuthRetryableFetchError('Unexpected client status', 400), 'reset', resetFallback],
  [{ code: 'invalid_credentials', message: 'USER IS BANNED' }, 'sign_in', paused],
])('maps error %# for %s to approved copy', (error, action, expected) => {
  expect(describeAuthError(error, action)).toBe(expected);
});
