/**
 * @9in/node and @9in/sdk are local file: dependencies; tests run them from TypeScript
 * source so no build is needed (the "@9in/source" export condition selects @9in/sdk's
 * src/*.ts, ts-jest transpiles, `./x.js` imports map to `./x`).
 */
module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    testEnvironmentOptions: {customExportConditions: ['@9in/source', 'node', 'node-addons']},
    roots: ['<rootDir>/src'],
    modulePathIgnorePatterns: ['<rootDir>/build'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.test.json'}],
    },
    transformIgnorePatterns: ['/node_modules/(?!@9in/)'],
    moduleNameMapper: {
        '^@9in/node$': '<rootDir>/node_modules/@9in/node/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
};
