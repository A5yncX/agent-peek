import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A fresh-process import misses stale native ESM dependencies. Reload twice in ONE process.
test('Pi loader reloads newly added exports in every helper', {
  skip: !process.env.PI_PEEK_LOADER && 'Set PI_PEEK_LOADER to installed Pi dist/core/extensions/loader.js',
}, async () => {
  const { loadExtensions } = await import(pathToFileURL(resolve(process.env.PI_PEEK_LOADER)).href);
  const root = await mkdtemp(join(tmpdir(), 'peek-reload-'));
  try {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const helpers = pkg.files.filter(file => file !== 'index.ts' && /^[a-z0-9-]+\.(ts|mjs)$/.test(file));
    assert.ok(helpers.length >= 5);
    const sources = await Promise.all(helpers.map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    for (const version of [0, 1]) {
      for (const [i, file] of helpers.entries()) {
        await writeFile(join(root, file), `${sources[i]}\nexport const __peekReload${version} = ${version};\n`);
      }
      const imports = helpers.map((file, i) => `import { __peekReload${version} as p${i} } from './${file}';`).join('\n');
      const entry = join(root, 'index.ts');
      await writeFile(entry, `${imports}\nexport default pi => pi.registerCommand('probe', {
        handler: () => [${helpers.map((_, i) => `p${i}`).join(', ')}]
      });`);
      const loaded = await loadExtensions([entry], root);
      assert.deepEqual(loaded.errors, []);
      assert.deepEqual(await loaded.extensions[0].commands.get('probe').handler(), helpers.map(() => version));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
