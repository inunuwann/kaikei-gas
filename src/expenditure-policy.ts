import {
  APPLICATION_TYPE_OPTIONS,
  PDF_MIME_TYPE,
  RECEIPT_LABEL,
  REIMBURSEMENT_REQUEST_TYPE,
  SETTLEMENT_TYPE,
  STANDARD_REQUEST_TYPE,
  normalizeApplicationRequestType,
  stripDetailSuffix,
  type ApplicationRequestType,
  type AttachmentPayload,
  type ExpenditureRecord,
  type RequestAvailability,
  type RequestAvailabilityMap,
  type UnsettledItem,
  type UserHistoryEntry,
} from './accounting-domain.ts';

const ACTIVE_STATUSES_BY_TYPE: Record<ApplicationRequestType, Set<string>> = {
  [STANDARD_REQUEST_TYPE]: new Set(['申請中', '承認済', '未精算']),
  [REIMBURSEMENT_REQUEST_TYPE]: new Set(['申請中']),
};

const USED_BUDGET_STATUSES = new Set(['承認済', '精算完了']);

const REQUEST_BLOCK_MESSAGES: Record<ApplicationRequestType, string> = {
  [STANDARD_REQUEST_TYPE]: '未完了の通常請求があるため、新しい通常請求はできません。',
  [REIMBURSEMENT_REQUEST_TYPE]: '申請中の事後請求があるため、新しい事後請求はできません。',
};

export interface GroupAccountingSummary {
  usedAmount: number;
  remainingBudget: number;
  unsettledItems: UnsettledItem[]; // ← unsettledItem から unsettledItems (配列)に変更
  history: UserHistoryEntry[];
  requestAvailability: RequestAvailabilityMap;
}

export class ExpenditureRequestPolicy {
  static getRequestAvailability(
    records: ExpenditureRecord[],
    type: ApplicationRequestType,
  ): RequestAvailability {
    const activeRecord = this.findActiveRequest(records, type);
    if (!activeRecord) {
      return {
        allowed: true,
        reason: null,
        activeRecordId: null,
      };
    }

    return {
      allowed: false,
      reason: REQUEST_BLOCK_MESSAGES[type],
      activeRecordId: activeRecord.id,
    };
  }

  static assertCanCreateRequest(records: ExpenditureRecord[], type: string): void {
    const normalizedType = normalizeApplicationRequestType(type);
    if (!normalizedType) {
      throw new Error('不正な申請タイプです。');
    }

    const availability = this.getRequestAvailability(records, normalizedType);
    if (!availability.allowed) {
      throw new Error(availability.reason ?? '現在この申請は作成できません。');
    }
  }

  static assertCanStartSettlement(records: ExpenditureRecord[]): void {
    if (this.findUnsettledItems(records).length === 0) {
      throw new Error('精算対象の請求が見つかりません。');
    }
  }

  static requiresAttachment(type: string): boolean {
    return type === REIMBURSEMENT_REQUEST_TYPE || type === SETTLEMENT_TYPE;
  }

  static validateAttachment(type: string, attachment: AttachmentPayload): void {
    const hasFile = Boolean(attachment.fileName || attachment.mimeType);

    if (this.requiresAttachment(type) && !hasFile) {
      throw new Error(`${RECEIPT_LABEL}としてPDFファイルを添付してください。`);
    }

    if (!hasFile) {
      return;
    }

    const fileName = String(attachment.fileName ?? '').toLowerCase();
    const mimeType = String(attachment.mimeType ?? '').toLowerCase();
    const isPdf = mimeType === PDF_MIME_TYPE || fileName.endsWith('.pdf');

    if (!isPdf) {
      throw new Error('添付できるファイルはPDFのみです。');
    }
  }

  static findUnsettledItems(
    records: ExpenditureRecord[],
    formatDate: (date: Date) => string = defaultDateFormatter,
  ): UnsettledItem[] {
    // 通常請求（事前）と事後請求のうち、未精算のものをすべて取得
    return records
      .filter(
        (record) =>
          (record.type === STANDARD_REQUEST_TYPE || record.type === REIMBURSEMENT_REQUEST_TYPE) &&
          record.status === '未精算',
      )
      .sort(compareRecordsDesc)
      .map((target) => ({
        id: target.id,
        amount: target.amount,
        content: stripDetailSuffix(target.content),
        date: formatDate(target.date),
      }));
  }

  static summarizeGroupRecords(
    records: ExpenditureRecord[],
    budgetTotal: number,
    formatDate: (date: Date) => string = defaultDateFormatter,
  ): GroupAccountingSummary {
    const usedAmount = records.reduce((sum, record) => {
      return USED_BUDGET_STATUSES.has(record.status) ? sum + record.amount : sum;
    }, 0);

    const sorted = [...records].sort(compareRecordsDesc);
    const history: UserHistoryEntry[] = sorted.map((record) => ({
      id: record.id,
      date: formatDate(record.date),
      type: record.type,
      status: record.status,
      amount: record.amount,
      content: stripDetailSuffix(record.content),
    }));

    return {
      usedAmount,
      remainingBudget: budgetTotal - usedAmount,
      unsettledItems: this.findUnsettledItems(sorted, formatDate),
      history,
      requestAvailability: {
        [STANDARD_REQUEST_TYPE]: this.getRequestAvailability(sorted, STANDARD_REQUEST_TYPE),
        [REIMBURSEMENT_REQUEST_TYPE]: this.getRequestAvailability(
          sorted,
          REIMBURSEMENT_REQUEST_TYPE,
        ),
      },
    };
  }

  private static findActiveRequest(
    records: ExpenditureRecord[],
    type: ApplicationRequestType,
  ): ExpenditureRecord | null {
    return (
      [...records]
        .filter(
          (record) => record.type === type && ACTIVE_STATUSES_BY_TYPE[type].has(record.status),
        )
        .sort(compareRecordsDesc)[0] ?? null
    );
  }
}

function compareRecordsDesc(a: ExpenditureRecord, b: ExpenditureRecord): number {
  const timeDiff = b.date.getTime() - a.date.getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return b.id.localeCompare(a.id, 'ja', {
    numeric: true,
    sensitivity: 'base',
  });
}

function defaultDateFormatter(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export function createEmptyRequestAvailabilityMap(): RequestAvailabilityMap {
  return APPLICATION_TYPE_OPTIONS.reduce((acc, type) => {
    acc[type] = {
      allowed: true,
      reason: null,
      activeRecordId: null,
    };
    return acc;
  }, {} as RequestAvailabilityMap);
}
