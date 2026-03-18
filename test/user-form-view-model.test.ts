import test from 'node:test';
import assert from 'node:assert/strict';

import { UserFormViewModelFactory } from '../src/user-form-view-model.ts';
import { createRequestAvailabilityMap } from './helpers.ts';

test('buildBootstrap exposes only application types and PDF receipt settings', () => {
  const bootstrap = UserFormViewModelFactory.buildBootstrap({
    requestAvailability: createRequestAvailabilityMap(),
    unsettledItem: null,
  });

  assert.equal(bootstrap.receiptLabel, '領収書(レシート)');
  assert.equal(bootstrap.fileAccept, 'application/pdf');
  assert.deepEqual(
    bootstrap.applicationTypes.map((typeOption) => typeOption.value),
    ['通常請求', '事後請求'],
  );
});

test('application state hides receipt upload for standard requests', () => {
  const state = UserFormViewModelFactory.buildState(
    'application',
    {
      requestAvailability: createRequestAvailabilityMap(),
      unsettledItem: null,
    },
    '通常請求',
  );

  assert.equal(state.title, '支出申請');
  assert.equal(state.requestType, '通常請求');
  assert.equal(state.showTypeSelector, true);
  assert.equal(state.showFileUpload, false);
  assert.equal(state.fileRequired, false);
});

test('standard settlement state hides type selector and requires PDF receipt upload', () => {
  const state = UserFormViewModelFactory.buildState('settlement', {
    requestAvailability: createRequestAvailabilityMap(),
    unsettledItem: {
      id: 'EXP-20260318-120000',
      amount: 4000,
      content: '合宿費',
      date: '2026/03/18',
    },
  });

  assert.equal(state.title, '通常精算手続き');
  assert.equal(state.requestType, '通常精算');
  assert.equal(state.showTypeSelector, false);
  assert.equal(state.showFileUpload, true);
  assert.equal(state.fileRequired, true);
  assert.equal(state.fileLabel, '領収書(レシート)');
  assert.equal(state.fileAccept, 'application/pdf');
});

test('application state falls back to the available request type when reimbursement is blocked', () => {
  const state = UserFormViewModelFactory.buildState('application', {
    requestAvailability: createRequestAvailabilityMap({
      事後請求: {
        allowed: false,
        reason: '申請中の事後請求があるため、新しい事後請求はできません。',
        activeRecordId: 'EXP-20260318-120000',
      },
    }),
    unsettledItem: null,
  });

  assert.equal(state.requestType, '通常請求');
  assert.deepEqual(
    state.applicationTypes.map((typeOption) => ({
      value: typeOption.value,
      allowed: typeOption.allowed,
    })),
    [
      { value: '通常請求', allowed: true },
      { value: '事後請求', allowed: false },
    ],
  );
});

test('hasAvailableApplicationType returns false when both request types are blocked', () => {
  const context = {
    requestAvailability: createRequestAvailabilityMap({
      通常請求: {
        allowed: false,
        reason: '未完了の通常請求があるため、新しい通常請求はできません。',
        activeRecordId: 'EXP-20260318-100000',
      },
      事後請求: {
        allowed: false,
        reason: '申請中の事後請求があるため、新しい事後請求はできません。',
        activeRecordId: 'EXP-20260318-120000',
      },
    }),
    unsettledItem: null,
  };

  assert.equal(UserFormViewModelFactory.hasAvailableApplicationType(context), false);
});
