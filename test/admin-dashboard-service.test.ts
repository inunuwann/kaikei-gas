import test from 'node:test';
import assert from 'node:assert/strict';

import { AdminDashboardService } from '../src/admin-dashboard-service.ts';
import { createRecord } from './helpers.ts';

const service = new AdminDashboardService();

const records = [
  createRecord({
    id: 'EXP-20260318-100000',
    date: new Date('2026-03-18T10:00:00+09:00'),
    dateKey: '2026-03-18',
    groupName: '団体A',
    type: '事前',
    amount: 5000,
    content: '備品購入',
  }),
  createRecord({
    id: 'EXP-20260319-090000',
    date: new Date('2026-03-19T09:00:00+09:00'),
    dateKey: '2026-03-19',
    groupName: '団体B',
    type: '事後',
    amount: 3000,
    content: '交通費',
  }),
  createRecord({
    id: 'EXP-20260320-080000',
    date: new Date('2026-03-20T08:00:00+09:00'),
    dateKey: '2026-03-20',
    groupName: '団体C',
    type: '精算',
    amount: 4500,
    content: '宿泊費',
  }),
  createRecord({
    id: 'EXP-20260321-070000',
    date: new Date('2026-03-21T07:00:00+09:00'),
    dateKey: '2026-03-21',
    groupName: '団体A',
    type: '事後',
    amount: 2000,
    content: '資料印刷',
  }),
];

test('filters by partial ID', () => {
  const result = service.filterAndSort(records, { idQuery: '20260320' });
  assert.deepEqual(result.map((record) => record.id), ['EXP-20260320-080000']);
});

test('filters by inclusive date range', () => {
  const result = service.filterAndSort(records, {
    dateFrom: '2026-03-19',
    dateTo: '2026-03-20',
  });

  assert.deepEqual(
    result.map((record) => record.id),
    ['EXP-20260320-080000', 'EXP-20260319-090000'],
  );
});

test('filters by multiple groups and multiple types', () => {
  const result = service.filterAndSort(records, {
    groups: ['団体A', '団体C'],
    types: ['精算', '事前'],
  });

  assert.deepEqual(
    result.map((record) => record.id),
    ['EXP-20260320-080000', 'EXP-20260318-100000'],
  );
});

test('supports exact, minimum, maximum, and range amount searches', () => {
  assert.deepEqual(
    service.filterAndSort(records, {
      amountMode: 'exact',
      amountValue: 3000,
    }).map((record) => record.id),
    ['EXP-20260319-090000'],
  );

  assert.deepEqual(
    service.filterAndSort(records, {
      amountMode: 'min',
      amountValue: 4500,
    }).map((record) => record.id),
    ['EXP-20260320-080000', 'EXP-20260318-100000'],
  );

  assert.deepEqual(
    service.filterAndSort(records, {
      amountMode: 'max',
      amountValue: 2500,
    }).map((record) => record.id),
    ['EXP-20260321-070000'],
  );

  assert.deepEqual(
    service.filterAndSort(records, {
      amountMode: 'range',
      amountMin: 2500,
      amountMax: 4500,
    }).map((record) => record.id),
    ['EXP-20260320-080000', 'EXP-20260319-090000'],
  );
});

test('filters by content keyword', () => {
  const result = service.filterAndSort(records, {
    contentQuery: '交通',
  });

  assert.deepEqual(result.map((record) => record.id), ['EXP-20260319-090000']);
});

test('sorts by date in ascending and descending order', () => {
  assert.deepEqual(
    service.filterAndSort(records, {
      sortBy: 'date',
      sortOrder: 'asc',
    }).map((record) => record.id),
    [
      'EXP-20260318-100000',
      'EXP-20260319-090000',
      'EXP-20260320-080000',
      'EXP-20260321-070000',
    ],
  );

  assert.deepEqual(
    service.filterAndSort(records, {
      sortBy: 'date',
      sortOrder: 'desc',
    }).map((record) => record.id),
    [
      'EXP-20260321-070000',
      'EXP-20260320-080000',
      'EXP-20260319-090000',
      'EXP-20260318-100000',
    ],
  );
});

test('sorts by ID in ascending and descending order', () => {
  assert.deepEqual(
    service.filterAndSort(records, {
      sortBy: 'id',
      sortOrder: 'asc',
    }).map((record) => record.id),
    [
      'EXP-20260318-100000',
      'EXP-20260319-090000',
      'EXP-20260320-080000',
      'EXP-20260321-070000',
    ],
  );

  assert.deepEqual(
    service.filterAndSort(records, {
      sortBy: 'id',
      sortOrder: 'desc',
    }).map((record) => record.id),
    [
      'EXP-20260321-070000',
      'EXP-20260320-080000',
      'EXP-20260319-090000',
      'EXP-20260318-100000',
    ],
  );
});

test('getFilterOptions returns unique sorted group and type lists', () => {
  assert.deepEqual(service.getFilterOptions(records), {
    groups: ['団体A', '団体B', '団体C'],
    types: ['事後', '事前', '精算'],
  });
});
