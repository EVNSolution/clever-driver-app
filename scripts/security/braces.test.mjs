import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const bracesPath = require.resolve('braces');
const braces = require(bracesPath);
const micromatchPath = require.resolve('micromatch');
const micromatch = require(micromatchPath);
const nestingError = (error) => error instanceof SyntaxError && /nesting depth exceeds/.test(error.message);

function hostileCall(modulePath, operation, opening = '{', closing = '}') {
  const source = `
    const library = require(${JSON.stringify(modulePath)});
    const input = ${JSON.stringify(opening)}.repeat(4000) + 'x' + ${JSON.stringify(closing)}.repeat(4000);
    try {
      ${operation === 'default' ? 'library(input)' : `library[${JSON.stringify(operation)}](input)`};
      console.log(JSON.stringify({ name: 'accepted', message: '' }));
    } catch (error) {
      console.log(JSON.stringify({ name: error.name, message: error.message }));
    }
  `;
  const child = spawnSync(process.execPath, ['--stack_size=512', '--max-old-space-size=128', '-e', source], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.name, 'SyntaxError');
  assert.match(result.message, /nesting depth exceeds/);
}

for (const operation of ['default', 'parse', 'compile', 'expand', 'stringify']) {
  test(`installed braces rejects deeply nested input through ${operation} without stack exhaustion`, () => {
    hostileCall(bracesPath, operation);
  });
}

test('installed braces also bounds parenthesis nesting', () => {
  hostileCall(bracesPath, 'compile', '(', ')');
});

function nestedAst(depth) {
  let ast = { type: 'root', nodes: [] };
  for (let index = 0; index < depth; index += 1) ast = { type: 'root', nodes: [ast] };
  return ast;
}

for (const operation of ['compile', 'expand', 'stringify']) {
  test(`installed braces ${operation} accepts direct AST depth 100 and rejects depth 101`, () => {
    assert.deepEqual(braces[operation](nestedAst(100)), operation === 'expand' ? [] : '');
    assert.throws(() => braces[operation](nestedAst(101)), nestingError);
  });
}

test('installed braces preserves normal alternatives, ranges, escaping and nested syntax', () => {
  assert.equal(braces.compile('src/{app,shared}/**/*.{js,ts}'), 'src/(app|shared)/**/*.(js|ts)');
  assert.deepEqual(braces.expand('file-{01..03}.js'), ['file-01.js', 'file-02.js', 'file-03.js']);
  assert.deepEqual(braces.expand('a\\{b,c\\}'), ['a{b,c}']);
  assert.deepEqual(braces.expand('{a,{b,c}}'), ['a', 'b', 'c']);
  const nested = '{'.repeat(99) + 'x' + '}'.repeat(99);
  assert.equal(braces.stringify(nested), nested);
  assert.deepEqual(braces.expand(nested), [nested]);
  assert.throws(() => braces.expand('{1..1001}'), /range limit/i);
});

test('installed micromatch resolves the same braces package', () => {
  assert.equal(createRequire(micromatchPath).resolve('braces'), bracesPath);
});

for (const operation of ['parse', 'braces', 'braceExpand']) {
  test(`installed micromatch ${operation} rejects deeply nested brace input`, () => {
    hostileCall(micromatchPath, operation);
  });
}

test('installed micromatch preserves compilation, expansion and matching used by tooling', () => {
  assert.deepEqual(micromatch.braces('src/{app,shared}/*.ts'), ['src/(app|shared)/*.ts']);
  assert.deepEqual(micromatch.braceExpand('src/{app,shared}/*.ts'), ['src/app/*.ts', 'src/shared/*.ts']);
  assert.equal(micromatch.parse('src/{app,shared}/*.ts').length, 1);
  assert.deepEqual(micromatch(['src/app/a.ts', 'src/shared/b.ts', 'src/app/a.png'], ['src/{app,shared}/*.ts']), [
    'src/app/a.ts', 'src/shared/b.ts',
  ]);
});

for (const packageName of ['metro-file-map', '@expo/metro-file-map']) {
  test(`${packageName} watcher glob filtering retains normal, hidden and excluded file behavior`, () => {
    // Exercise the real watcher filtering function. This path uses micromatch.some;
    // it is a compatibility check, not proof that this path invokes braces.
    const common = require(join(dirname(require.resolve(packageName)), 'watchers', 'common.js'));
    const globs = ['src/**/*.{js,ts}'];
    assert.equal(common.includedByGlob('f', globs, false, 'src/app/main.ts'), true);
    assert.equal(common.includedByGlob('f', globs, false, 'src/app/.hidden.ts'), false);
    assert.equal(common.includedByGlob('f', globs, true, 'src/app/.hidden.ts'), true);
    assert.equal(common.includedByGlob('f', globs, false, 'src/app/image.png'), false);
    assert.equal(common.includedByGlob('f', [], false, '.hidden'), false);
    assert.equal(common.includedByGlob('d', globs, false, 'src/assets'), true);
  });
}
