import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APPLICATION_TYPE_OPTIONS,
  getExpenditureTypeLabel,
  normalizeApplicationRequestType,
  normalizeExpenditureType,
} from '../src/accounting-domain.ts';

test('application type options expose only standard and reimbursement requests', () => {
  assert.deepEqual([...APPLICATION_TYPE_OPTIONS], ['通常請求', '事後請求']);
});

test('legacy expenditure type labels are normalized to the new canonical labels', () => {
  assert.equal(normalizeExpenditureType('事前'), '通常請求');
  assert.equal(normalizeExpenditureType('事後'), '事後請求');
  assert.equal(normalizeExpenditureType('精算'), '通常精算');
  assert.equal(getExpenditureTypeLabel('事前'), '通常請求');
});

test('only application request types are accepted for new applications', () => {
  assert.equal(normalizeApplicationRequestType('通常請求'), '通常請求');
  assert.equal(normalizeApplicationRequestType('事後'), '事後請求');
  assert.equal(normalizeApplicationRequestType('通常精算'), null);
});
