export const PASSWORD_VERIFICATION_FAILED_MESSAGE =
  'Could not verify your current password. Check your connection and try again.';

export function isInvalidCredentialsError(error) {
  if (error?.code === 'invalid_credentials') return true;
  if (error?.status !== 400) return false;

  const message = typeof error?.message === 'string' ? error.message.trim().toLowerCase() : '';
  return [
    'invalid login credentials',
    'invalid credentials',
    'invalid email or password',
    'incorrect email or password',
    'email or password is incorrect',
  ].includes(message);
}

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { field: null, message: 'All password fields are required' };
  }
  if (newPassword.length < 8) {
    return { field: 'new', message: 'New password must be at least 8 characters' };
  }
  if (newPassword !== confirmPassword) {
    return { field: 'confirm', message: 'New passwords do not match' };
  }
  return null;
}

export function describePasswordChangeFailure({ error, phase }) {
  if (phase === 'verification') {
    return isInvalidCredentialsError(error)
      ? { field: 'current', message: 'Current password is incorrect' }
      : { field: null, message: PASSWORD_VERIFICATION_FAILED_MESSAGE };
  }
  return { field: null, message: error?.message || 'Failed to change password' };
}
