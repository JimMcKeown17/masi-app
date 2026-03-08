// Mock AsyncStorage for test environment
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Suppress MaterialCommunityIcon font-loading warnings in tests
jest.mock('react-native-paper/src/components/MaterialCommunityIcon', () => {
  const { Text } = require('react-native');
  return ({ name, ...props }) => <Text {...props}>{name}</Text>;
});
