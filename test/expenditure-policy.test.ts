import test from 'node:test';
import assert from 'node:assert/strict';

import { ExpenditureRequestPolicy } from '../src/expenditure-policy.ts';
import { createRecord } from './helpers.ts';

test('summarizeGroupRecords computes remaining budget, history, and unsettled advance', () => {
  const records = [
    createRecord({
      id: 'EXP-20260320-120000',
      date: new Date('2026-03-20T12:00:00+09:00'),
      dateKey: '2026-03-20',
      type: '事前',
      status: '未精算',
      amount: 4000,
      content: '合宿費 (詳細あり)',
    }),
    createRecord({
      id: 'EXP-20260318-090000',
      date: new Date('2026-03-18T09:00:00+09:00'),
      dateKey: '2026-03-18',
      type: '事後',
      status: '承認済',
      amount: 2500,
      content: '交通費 (詳細あり)',
    }),
    createRecord({
      id: 'EXP-20260315-090000',
      date: new Date('2026-03-15T09:00:00+09:00'),
      dateKey: '2026-03-15',
      type: '事後',
      status: '却下',
      amount: 1000,
      content: '備品代 (詳細あり)',
    }),
  ];

  const summary = ExpenditureRequestPolicy.summarizeGroupRecords(
    records,
    10000,
    (date) => `${date.getMonth() + 1}/${date.getDate()}`,
  );

  assert.equal(summary.usedAmount, 2500);
  assert.equal(summary.remainingBudget, 7500);
  assert.deepEqual(summary.unsettledItem, {
    id: 'EXP-20260320-120000',
    amount: 4000,
    content: '合宿費',
    date: '3/20',
  });
  assert.deepEqual(
    summary.history.map((record) => record.id),
    ['EXP-20260320-120000', 'EXP-20260318-090000', 'EXP-20260315-090000'],
  );
});

test('assertCanCreateRequest blocks another advance request while unfinished advance exists', () => {
  const records = [
    createRecord({
      type: '事前',
      status: '未精算',
      id: 'EXP-20260319-120000',
    }),
  ];

  assert.throws(
    () => ExpenditureRequestPolicy.assertCanCreateRequest(records, '事前'),
    /新しい事前請求はできません/,
  );
});

test('assertCanCreateRequest blocks another reimbursement only while a reimbursement is pending', () => {
  const pendingRecords = [
    createRecord({
      type: '事後',
      status: '申請中',
      id: 'EXP-20260318-100000',
    }),
  ];

  const closedRecords = [
    createRecord({
      type: '事後',
      status: '却下',
      id: 'EXP-20260318-100000',
    }),
  ];

  assert.throws(
    () => ExpenditureRequestPolicy.assertCanCreateRequest(pendingRecords, '事後'),
    /新しい事後請求はできません/,
  );
  assert.doesNotThrow(() =>
    ExpenditureRequestPolicy.assertCanCreateRequest(closedRecords, '事後'),
  );
});

test('validateAttachment enforces PDF uploads for reimbursement and settlement flows', () => {
  assert.throws(
    () =>
      ExpenditureRequestPolicy.validateAttachment('事後', {
        fileName: null,
        mimeType: null,
      }),
    /PDFファイルを添付してください/,
  );

  assert.throws(
    () =>
      ExpenditureRequestPolicy.validateAttachment('精算', {
        fileName: 'receipt.png',
        mimeType: 'image/png',
      }),
    /PDFのみ/,
  );

  assert.doesNotThrow(() =>
    ExpenditureRequestPolicy.validateAttachment('事後', {
      fileName: 'receipt.pdf',
      mimeType: 'application/pdf',
    }),
  );
  assert.doesNotThrow(() =>
    ExpenditureRequestPolicy.validateAttachment('事前', {
      fileName: null,
      mimeType: null,
    }),
  );
});

test('assertCanStartSettlement requires an unsettled advance request', () => {
  const withUnsettledAdvance = [
    createRecord({
      type: '事前',
      status: '未精算',
      id: 'EXP-20260318-100000',
    }),
  ];
  const withoutUnsettledAdvance = [
    createRecord({
      type: '事後',
      status: '申請中',
      id: 'EXP-20260318-100000',
    }),
  ];

  assert.doesNotThrow(() =>
    ExpenditureRequestPolicy.assertCanStartSettlement(withUnsettledAdvance),
  );
  assert.throws(
    () => ExpenditureRequestPolicy.assertCanStartSettlement(withoutUnsettledAdvance),
    /精算対象の事前請求/,
  );
});
