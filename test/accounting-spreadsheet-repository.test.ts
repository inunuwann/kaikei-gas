import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAdminEmails,
  extractAllowedItemsByGroup,
  extractUsers,
  mapInquiryRow,
} from '../src/accounting-spreadsheet-repository.ts';

test('extractAdminEmails trims values and ignores invalid rows', () => {
  const rows = [
    ['admin-1', '  admin@example.com  '],
    ['admin-2', 'not-an-email'],
    ['admin-3', 'sub@example.org'],
    ['admin-4', ''],
  ];

  assert.deepEqual(extractAdminEmails(rows), ['admin@example.com', 'sub@example.org']);
});

test('extractUsers maps master rows into user records', () => {
  const rows = [
    ['member-a@example.com', 'group-a', '団体A', '12000'],
    ['member-b@example.com', 'group-b', '団体B', 0],
    ['', 'group-c', '団体C', 5000],
  ];

  assert.deepEqual(extractUsers(rows), [
    {
      email: 'member-a@example.com',
      groupId: 'group-a',
      groupName: '団体A',
      budgetTotal: 12000,
    },
    {
      email: 'member-b@example.com',
      groupId: 'group-b',
      groupName: '団体B',
      budgetTotal: 0,
    },
  ]);
});

test('extractAllowedItemsByGroup groups master rows by group id', () => {
  const rows = [
    ['group-a', '交通費', 1200],
    ['group-a', '宿泊費', null],
    ['group-b', '備品購入', 3000],
    ['group-c', '', 1000],
  ];

  assert.deepEqual(extractAllowedItemsByGroup(rows), {
    'group-a': [
      { name: '交通費', defaultPrice: 1200 },
      { name: '宿泊費', defaultPrice: null },
    ],
    'group-b': [
      { name: '備品購入', defaultPrice: 3000 },
    ],
  });
});

test('mapInquiryRow maps master rows into inquiry records', () => {
  const row = ['INQ-2026', '2026/03/18 12:00:00', '団体A', 'user@example.com', '質問', '本文です', '未対応'];

  const record = mapInquiryRow(row, 2);
  assert.equal(record.id, 'INQ-2026');
  assert.equal(record.group, '団体A');
  assert.equal(record.sender, 'user@example.com');
  assert.equal(record.subject, '質問');
  assert.equal(record.message, '本文です');
  assert.equal(record.status, '未対応');
  assert.equal(record.rowIndex, 2);
  assert.equal(record.date instanceof Date, true);
});
