export const LOGIN_COPY = {
  emptyBoth: 'Please enter both email and password',
  invalidEmail: 'Please enter a valid email address',
  offline: 'You’re offline. Sign in needs the internet.',
  footnote: 'This app is for Masinyusane staff only.',
};

export function validateLoginInput(email, password) {
  if (!email || !password) return { kind: 'empty', email: !email, password: !password };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: 'format' };
  return null;
}

export function clearLoginErrorOnEdit(error, field, nextValue) {
  if (error?.kind === 'empty') {
    if (!nextValue) return error;
    const next = { ...error, [field]: false };
    return next.email || next.password ? next : null;
  }
  if (error?.kind === 'format' && field === 'password') return error;
  return null;
}
