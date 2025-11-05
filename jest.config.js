module.exports = {
  silent: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/ghost-local/', '/themes/'],
  modulePathIgnorePatterns: ['/ghost-local/', '/themes/'],
};
