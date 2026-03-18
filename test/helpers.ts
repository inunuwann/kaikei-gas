import type {
  ExpenditureRecord,
  RequestAvailabilityMap,
} from '../src/accounting-domain.ts';

export function createRecord(
  overrides: Partial<ExpenditureRecord> = {},
): ExpenditureRecord {
  const date = overrides.date ?? new Date('2026-03-18T12:00:00+09:00');

  return {
    id: overrides.id ?? 'EXP-20260318-120000',
    date,
    dateKey: overrides.dateKey ?? toDateKey(date),
    groupId: overrides.groupId ?? 'group-a',
    groupName: overrides.groupName ?? '団体A',
    type: overrides.type ?? '事後',
    status: overrides.status ?? '申請中',
    amount: overrides.amount ?? 1000,
    content: overrides.content ?? '交通費 (詳細あり)',
    file: overrides.file ?? 'https://example.com/receipt.pdf',
    rowIndex: overrides.rowIndex,
    settlementFlag: overrides.settlementFlag,
  };
}

export function createRequestAvailabilityMap(
  overrides?: Partial<RequestAvailabilityMap>,
): RequestAvailabilityMap {
  return {
    事前: {
      allowed: true,
      reason: null,
      activeRecordId: null,
      ...(overrides?.事前 ?? {}),
    },
    事後: {
      allowed: true,
      reason: null,
      activeRecordId: null,
      ...(overrides?.事後 ?? {}),
    },
  };
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
