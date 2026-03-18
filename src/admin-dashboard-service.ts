import {
  compareText,
  normalizeText,
  parseNumberish,
  toDateKey,
  type ExpenditureRecord,
} from './accounting-domain.ts';

export type AmountFilterMode = 'none' | 'exact' | 'min' | 'max' | 'range';
export type AdminSortField = 'date' | 'id';
export type SortOrder = 'asc' | 'desc';

export interface AdminSearchCriteriaInput {
  idQuery?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  groups?: string[] | null;
  types?: string[] | null;
  amountMode?: AmountFilterMode | string | null;
  amountValue?: number | string | null;
  amountMin?: number | string | null;
  amountMax?: number | string | null;
  contentQuery?: string | null;
  sortBy?: AdminSortField | string | null;
  sortOrder?: SortOrder | string | null;
}

export interface AdminSearchCriteria {
  idQuery: string;
  dateFrom: string | null;
  dateTo: string | null;
  groups: string[];
  types: string[];
  amountMode: AmountFilterMode;
  amountValue: number | null;
  amountMin: number | null;
  amountMax: number | null;
  contentQuery: string;
  sortBy: AdminSortField;
  sortOrder: SortOrder;
}

export interface AdminFilterOptions {
  groups: string[];
  types: string[];
}

export class AdminDashboardService {
  normalizeCriteria(input: AdminSearchCriteriaInput = {}): AdminSearchCriteria {
    const amountMode = normalizeAmountMode(input.amountMode);
    const sortBy = normalizeSortField(input.sortBy);
    const sortOrder = normalizeSortOrder(input.sortOrder);

    return {
      idQuery: String(input.idQuery ?? '').trim(),
      dateFrom: toDateKey(input.dateFrom ?? null),
      dateTo: toDateKey(input.dateTo ?? null),
      groups: normalizeMultiValue(input.groups),
      types: normalizeMultiValue(input.types),
      amountMode,
      amountValue: parseNumberish(input.amountValue),
      amountMin: parseNumberish(input.amountMin),
      amountMax: parseNumberish(input.amountMax),
      contentQuery: String(input.contentQuery ?? '').trim(),
      sortBy,
      sortOrder,
    };
  }

  filterAndSort(
    records: ExpenditureRecord[],
    criteriaInput: AdminSearchCriteriaInput = {},
  ): ExpenditureRecord[] {
    const criteria = this.normalizeCriteria(criteriaInput);
    return [...records]
      .filter((record) => matchesRecord(record, criteria))
      .sort((left, right) => compareRecords(left, right, criteria));
  }

  getFilterOptions(records: ExpenditureRecord[]): AdminFilterOptions {
    return {
      groups: uniqueSorted(records.map((record) => record.groupName)),
      types: uniqueSorted(records.map((record) => record.type)),
    };
  }
}

function matchesRecord(record: ExpenditureRecord, criteria: AdminSearchCriteria): boolean {
  const normalizedId = normalizeText(record.id);
  const normalizedContent = normalizeText(record.content);
  const recordDateKey = record.dateKey ?? toDateKey(record.date);

  if (criteria.idQuery && !normalizedId.includes(normalizeText(criteria.idQuery))) {
    return false;
  }

  if (criteria.dateFrom && recordDateKey && recordDateKey < criteria.dateFrom) {
    return false;
  }

  if (criteria.dateTo && recordDateKey && recordDateKey > criteria.dateTo) {
    return false;
  }

  if (criteria.groups.length > 0 && !criteria.groups.includes(record.groupName)) {
    return false;
  }

  if (criteria.types.length > 0 && !criteria.types.includes(record.type)) {
    return false;
  }

  if (!matchesAmount(record.amount, criteria)) {
    return false;
  }

  if (criteria.contentQuery && !normalizedContent.includes(normalizeText(criteria.contentQuery))) {
    return false;
  }

  return true;
}

function matchesAmount(amount: number, criteria: AdminSearchCriteria): boolean {
  switch (criteria.amountMode) {
    case 'exact':
      return criteria.amountValue === null ? true : amount === criteria.amountValue;
    case 'min':
      return criteria.amountValue === null ? true : amount >= criteria.amountValue;
    case 'max':
      return criteria.amountValue === null ? true : amount <= criteria.amountValue;
    case 'range':
      if (criteria.amountMin !== null && amount < criteria.amountMin) {
        return false;
      }
      if (criteria.amountMax !== null && amount > criteria.amountMax) {
        return false;
      }
      return true;
    case 'none':
    default:
      return true;
  }
}

function compareRecords(
  left: ExpenditureRecord,
  right: ExpenditureRecord,
  criteria: AdminSearchCriteria,
): number {
  const orderFactor = criteria.sortOrder === 'asc' ? 1 : -1;
  const primary =
    criteria.sortBy === 'id'
      ? compareText(left.id, right.id)
      : left.date.getTime() - right.date.getTime();

  if (primary !== 0) {
    return primary * orderFactor;
  }

  const secondary =
    criteria.sortBy === 'id'
      ? left.date.getTime() - right.date.getTime()
      : compareText(left.id, right.id);

  return secondary * orderFactor;
}

function normalizeMultiValue(values: string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}

function normalizeAmountMode(value: string | null | undefined): AmountFilterMode {
  const allowed: AmountFilterMode[] = ['none', 'exact', 'min', 'max', 'range'];
  return allowed.includes(value as AmountFilterMode) ? (value as AmountFilterMode) : 'none';
}

function normalizeSortField(value: string | null | undefined): AdminSortField {
  return value === 'id' ? 'id' : 'date';
}

function normalizeSortOrder(value: string | null | undefined): SortOrder {
  return value === 'asc' ? 'asc' : 'desc';
}
