const scope = { setTag: jest.fn(), setTags: jest.fn(), setContext: jest.fn(), setFingerprint: jest.fn(), getUser: () => null };
module.exports = {
  init: jest.fn(), setContext: jest.fn(), setTags: jest.fn(), setUser: jest.fn(),
  captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn(),
  withScope: (task) => task(scope), getCurrentScope: () => scope,
  flush: jest.fn(async () => true), wrap: (component) => component,
  reactNavigationIntegration: () => ({ registerNavigationContainer: jest.fn() }),
};
