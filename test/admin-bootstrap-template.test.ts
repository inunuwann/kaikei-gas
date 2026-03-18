import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin template embeds dashboard bootstrap data for initial rendering', async () => {
  const html = await readFile('src/admin.html', 'utf8');

  assert.match(html, /var ADMIN_DASHBOARD_BOOTSTRAP =/);
  assert.match(html, /JSON\.stringify\(data\.bootstrap \|\| null\)/);
});
