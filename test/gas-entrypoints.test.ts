import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('build output exposes GAS entrypoints globally', async () => {
  await execFileAsync('node', ['build.js'], {
    cwd: process.cwd(),
  });

  const builtCode = await readFile('dist/code.js', 'utf8');

  assert.match(builtCode, /function doGet\(/);
  assert.match(builtCode, /function getAdminDashboardData\(/);
  assert.match(builtCode, /function updateStatus\(/);
  assert.match(builtCode, /function processForm\(/);
  assert.match(builtCode, /function processInquiry\(/);
  assert.match(builtCode, /Object\.assign\(globalThis,\s*\{/);
  assert.match(builtCode, /doGet,/);
  assert.match(builtCode, /processForm,/);
});
