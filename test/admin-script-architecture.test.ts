import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin dashboard client uses bootstrap loading and lazy inquiry fetching', async () => {
  const script = await readFile('src/admin_script.html', 'utf8');

  assert.match(script, /hasBootstrapData\(\)/);
  assert.match(script, /ADMIN_DASHBOARD_BOOTSTRAP/);
  assert.match(script, /getAdminDashboardBootstrap\(\)/);
  assert.match(script, /getInquiryDashboardData\(\)/);
  assert.match(script, /getFilteredExpenditures\(\)/);
  assert.doesNotMatch(script, /getAdminDashboardData\(this\.criteria\)/);
});
