import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin template renders a single-calendar date range picker with hidden start and end inputs', async () => {
  const html = await readFile('src/admin.html', 'utf8');

  assert.match(html, /id="filterDateRangePicker"/);
  assert.match(html, /id="filterDateRangeTrigger"/);
  assert.match(html, /id="filterDateRangePopover"/);
  assert.match(html, /id="filterDateRangeGrid"/);
  assert.match(html, /id="filterDateFrom" type="hidden"/);
  assert.match(html, /id="filterDateTo" type="hidden"/);
});
