import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin and user templates include the client debug logger', async () => {
  const [adminHtml, indexHtml] = await Promise.all([
    readFile('src/admin.html', 'utf8'),
    readFile('src/index.html', 'utf8'),
  ]);

  assert.match(adminHtml, /include\('client_debug'\)/);
  assert.match(indexHtml, /include\('client_debug'\)/);
});
