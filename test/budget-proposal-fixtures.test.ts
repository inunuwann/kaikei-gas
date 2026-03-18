import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';

import { BUDGET_PROPOSAL_FIXTURES } from './budget-proposal-fixtures.ts';

test('budget proposal fixtures cover every PDF under docs/test-data', async () => {
  const pdfFiles = (await readdir('docs/test-data'))
    .filter((fileName) => fileName.endsWith('.pdf'))
    .sort();

  const fixtureFiles = BUDGET_PROPOSAL_FIXTURES.map((fixture) => basename(fixture.sourceFile)).sort();

  assert.equal(BUDGET_PROPOSAL_FIXTURES.length, 23);
  assert.deepEqual(fixtureFiles, pdfFiles);
});

test('budget proposal fixtures preserve metadata and total amounts for every organization', () => {
  for (const fixture of BUDGET_PROPOSAL_FIXTURES) {
    assert.notEqual(fixture.groupName, '');
    assert.notEqual(fixture.representativeStudentNumber, '');
    assert.notEqual(fixture.representativeName, '');
    assert.notEqual(fixture.accountantStudentNumber, '');
    assert.notEqual(fixture.accountantName, '');

    const totalAmount = fixture.totalAmount ?? 0;
    const itemsTotal = fixture.items.reduce((sum, item) => {
      return sum + (item.total ?? 0);
    }, 0);

    assert.equal(itemsTotal, totalAmount, fixture.groupName);
  }
});

test('budget proposal fixtures keep quantity x unit price consistent for each line item', () => {
  for (const fixture of BUDGET_PROPOSAL_FIXTURES) {
    for (const item of fixture.items) {
      assert.notEqual(item.itemName, '', `${fixture.groupName} priority ${item.priority}`);
      if (item.unitPrice !== null && item.quantity !== null && item.total !== null) {
        assert.equal(
          item.unitPrice * item.quantity,
          item.total,
          `${fixture.groupName} priority ${item.priority}`,
        );
      }
    }
  }
});

test('budget proposal fixtures include expected high-volume and zero-budget cases', () => {
  const executive = BUDGET_PROPOSAL_FIXTURES.find(
    (fixture) => fixture.groupName === '学生会執行部',
  );
  const sportsFestival = BUDGET_PROPOSAL_FIXTURES.find(
    (fixture) => fixture.groupName === '体育祭実行委員会',
  );
  const modeling = BUDGET_PROPOSAL_FIXTURES.find(
    (fixture) => fixture.groupName === 'モデリング研究同好会',
  );

  assert.ok(executive);
  assert.equal(executive.totalAmount, 1531000);
  assert.equal(executive.items.length, 11);

  assert.ok(sportsFestival);
  assert.equal(sportsFestival.totalAmount, 603500);
  assert.equal(sportsFestival.items.length, 21);

  assert.ok(modeling);
  assert.equal(modeling.totalAmount, 0);
  assert.equal(modeling.items.length, 0);
});
