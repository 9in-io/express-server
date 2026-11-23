// Every export of the CommonJS build must also be importable by name from an ES module
// (`import {nineAdapter} from '@9in-io/express-server'`). Node finds those names by reading the
// build's source, which misses `export *` from an ES module. Run after `npm run build`.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const entry = fileURLToPath(new URL('../build/index.js', import.meta.url));
const cjs = Object.keys(createRequire(import.meta.url)(entry)).filter((k) => k !== '__esModule' && k !== 'default');
const esm = Object.keys(await import(entry));
const missing = cjs.filter((k) => !esm.includes(k));
if (missing.length) {
    console.error(`Not importable by name from an ES module: ${missing.join(', ')}`);
    console.error('If a name comes from @9in-io/node, check the export list in that package.');
    process.exit(1);
}
console.log(`All ${cjs.length} exports are importable by name from an ES module.`);
