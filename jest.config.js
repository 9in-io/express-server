const {existsSync} = require('fs');
const {dirname, join} = require('path');

/**
 * @9in-io/node and @9in-io/sdk come from npm (build/ and dist/) or, during local development,
 * from links to ../node and v2/packages/sdk. Links are run from TypeScript source, which the
 * npm packages do not ship, so that is only done when src/ exists: @9in-io/node is mapped to
 * src/index.ts and the "@9in/source" export condition selects @9in-io/sdk's src/*.ts.
 * ts-jest transpiles everything to CommonJS (allowJs for the ESM dist/*.js of @9in-io/sdk)
 * and `./x.js` imports map to `./x`.
 */
const nodeSource = join(__dirname, 'node_modules/@9in-io/node/src/index.ts');
const sdk = dirname(require.resolve('@9in-io/sdk/package.json', {paths: [dirname(require.resolve('@9in-io/node/package.json'))]}));
const sdkFromSource = existsSync(join(sdk, 'src'));

module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    testEnvironmentOptions: {customExportConditions: [...(sdkFromSource ? ['@9in/source'] : []), 'node', 'node-addons']},
    roots: ['<rootDir>/src'],
    modulePathIgnorePatterns: ['<rootDir>/build'],
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.test.json'}],
    },
    transformIgnorePatterns: ['/node_modules/(?!@9in-io/)'],
    moduleNameMapper: {
        ...(existsSync(nodeSource) ? {'^@9in-io/node$': nodeSource} : {}),
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
};
