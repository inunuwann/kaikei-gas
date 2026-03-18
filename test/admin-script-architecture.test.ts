import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin dashboard client uses bootstrap loading, lazy inquiry fetching, and single-calendar date range picking', async () => {
  const script = await readFile('src/admin_script.html', 'utf8');

  assert.match(script, /hasBootstrapData\(\)/);
  assert.match(script, /ADMIN_DASHBOARD_BOOTSTRAP/);
  assert.match(script, /getAdminDashboardBootstrap\(\)/);
  assert.match(script, /getInquiryDashboardData\(\)/);
  assert.match(script, /getFilteredExpenditures\(\)/);
  assert.match(script, /handleDateRangeSelection\(dateKey\)/);
  assert.match(script, /setDateRange\(dateFrom, dateTo\)/);
  assert.match(script, /filterDateRangeTrigger/);
  assert.match(script, /filterDateFrom/);
  assert.match(script, /filterDateTo/);
  assert.doesNotMatch(script, /getAdminDashboardData\(this\.criteria\)/);
});
