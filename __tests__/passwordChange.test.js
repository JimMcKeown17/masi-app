import {
  PASSWORD_VERIFICATION_FAILED_MESSAGE,
  describePasswordChangeFailure,
  isInvalidCredentialsError,
  validatePasswordChange,
} from '../src/utils/passwordChange';

describe('validatePasswordChange', () => {
  const valid = { currentPassword: 'current-password', newPassword: '12345678', confirmPassword: '12345678' };

  test.each(['currentPassword', 'newPassword', 'confirmPassword'])('%s is required', field => {
    expect(validatePasswordChange({ ...valid, [field]: '' })).toEqual({
      field: null, message: 'All password fields are required',
    });
  });

  test('empty wins over length and mismatch', () => {
    expect(validatePasswordChange({ currentPassword: '', newPassword: 'short', confirmPassword: 'different' })).toEqual({
      field: null, message: 'All password fields are required',
    });
  });

  test.each(['1234567', 'different'])('seven characters fail length before checking confirmation %s', confirmPassword => {
    expect(validatePasswordChange({ ...valid, newPassword: '1234567', confirmPassword })).toEqual({
      field: 'new', message: 'New password must be at least 8 characters',
    });
  });

  test('eight characters pass', () => {
    expect(validatePasswordChange(valid)).toBeNull();
  });

  test('a mismatch belongs to Confirm', () => {
    expect(validatePasswordChange({ ...valid, confirmPassword: '87654321' })).toEqual({
      field: 'confirm', message: 'New passwords do not match',
    });
  });
});

describe('isInvalidCredentialsError', () => {
  test('recognises the explicit invalid_credentials code', () => {
    expect(isInvalidCredentialsError({ code: 'invalid_credentials' })).toBe(true);
  });

  test.each([
    ' Invalid login credentials ',
    'invalid credentials',
    'invalid email or password',
    'incorrect email or password',
    'email or password is incorrect',
  ])('recognises status 400 with %s', message => {
    expect(isInvalidCredentialsError({ status: 400, message })).toBe(true);
  });

  test.each([
    { status: 0, message: 'Network request failed' },
    { status: 400, message: 'Something else' },
    { status: 401, message: 'Invalid login credentials' },
    { status: 400, message: null },
    null,
  ])('does not mislabel another failure as incorrect credentials: %j', error => {
    expect(isInvalidCredentialsError(error)).toBe(false);
  });
});

describe('describePasswordChangeFailure', () => {
  test('invalid credentials during verification belong to Current', () => {
    expect(describePasswordChangeFailure({ phase: 'verification', error: { code: 'invalid_credentials' } })).toEqual({
      field: 'current', message: 'Current password is incorrect',
    });
  });

  test('a verification network failure is a form note without marking Current wrong', () => {
    expect(PASSWORD_VERIFICATION_FAILED_MESSAGE).toBe('Could not verify your current password. Check your connection and try again.');
    expect(describePasswordChangeFailure({ phase: 'verification', error: { status: 0, message: 'Network request failed' } })).toEqual({
      field: null, message: PASSWORD_VERIFICATION_FAILED_MESSAGE,
    });
  });

  test('an update failure preserves its message as a form note, even for invalid_credentials', () => {
    expect(describePasswordChangeFailure({ phase: 'update', error: { code: 'invalid_credentials', message: 'Update rejected' } })).toEqual({
      field: null, message: 'Update rejected',
    });
  });

  test.each([{}, { message: '' }, null])('an update failure without a message uses the fallback: %j', error => {
    expect(describePasswordChangeFailure({ phase: 'update', error })).toEqual({
      field: null, message: 'Failed to change password',
    });
  });
});
