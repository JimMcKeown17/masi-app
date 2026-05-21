let databaseFactory = async () => {
  throw new Error('No expo-sqlite mock database factory configured');
};

const openDatabaseAsync = jest.fn((databaseName, options, directory) => (
  databaseFactory(databaseName, options, directory)
));

const __setDatabaseFactory = (nextFactory) => {
  databaseFactory = nextFactory;
};

const __reset = () => {
  databaseFactory = async () => {
    throw new Error('No expo-sqlite mock database factory configured');
  };
  openDatabaseAsync.mockClear();
};

module.exports = {
  openDatabaseAsync,
  __setDatabaseFactory,
  __reset,
};
