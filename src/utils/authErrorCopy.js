import { isAuthRetryableFetchError } from '@supabase/supabase-js';

export function describeAuthError(error, action) {
  const fallback = action === 'reset'
    ? 'Couldn’t send the reset link. Please try again.'
    : 'Couldn’t sign in. Please try again.';
  if (error?.code === 'user_banned' || /user is banned/i.test(error?.message ?? '')) {
    return action === 'sign_in' ? 'Your access is paused. Please contact your supervisor.' : fallback;
  }
  if (error?.code === 'invalid_credentials') {
    return action === 'sign_in' ? 'Invalid login credentials' : fallback;
  }
  if (isAuthRetryableFetchError(error)) {
    if (error.status === 0) return 'Couldn’t reach Masi. Check your internet connection and try again.';
    if (error.status >= 500) return 'Masi isn’t responding right now. Please try again in a few minutes.';
  }
  if (error?.code === 'over_request_rate_limit') {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (action === 'reset' && error?.code === 'over_email_send_rate_limit') {
    return 'Too many reset emails were requested. Please wait a while and try again.';
  }
  return fallback;
}
