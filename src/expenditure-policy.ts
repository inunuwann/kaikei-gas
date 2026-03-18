import {
  APPLICATION_TYPE_OPTIONS,
  isApplicationRequestType,
  PDF_MIME_TYPE,
  RECEIPT_LABEL,
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
  事前: new Set(['申請中', '承認済', '未精算']),
  事後: new Set(['申請中']),
};

const USED_BUDGET_STATUSES = new Set(['承認済', '精算完了']);

const REQUEST_BLOCK_MESSAGES: Record<ApplicationRequestType, string> = {
  事前: '未完了の事前請求があるため、新しい事前請求はできません。',
  事後: '申請中の事後請求があるため、新しい事後請求はできません。',
};

export interface GroupAccountingSummary {
  usedAmount: number;
  remainingBudget: number;
  unsettledItem: UnsettledItem | null;
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
    if (!isApplicationRequestType(type)) {
      throw new Error('不正な申請タイプです。');
    }

    const availability = this.getRequestAvailability(records, type);
    if (!availability.allowed) {
      throw new Error(availability.reason ?? '現在この申請は作成できません。');
    }
  }

  static assertCanStartSettlement(records: ExpenditureRecord[]): void {
    if (!this.findUnsettledAdvance(records)) {
      throw new Error('精算対象の事前請求が見つかりません。');
    }
  }

  static requiresAttachment(type: string): boolean {
    return type === '事後' || type === '精算';
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

  static findUnsettledAdvance(
    records: ExpenditureRecord[],
    formatDate: (date: Date) => string = defaultDateFormatter,
  ): UnsettledItem | null {
    const candidates = records
      .filter((record) => record.type === '事前' && record.status === '未精算')
      .sort(compareRecordsDesc);

    const target = candidates[0];
    if (!target) {
      return null;
    }

    return {
      id: target.id,
      amount: target.amount,
      content: stripDetailSuffix(target.content),
      date: formatDate(target.date),
    };
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
      unsettledItem: this.findUnsettledAdvance(sorted, formatDate),
      history,
      requestAvailability: {
        事前: this.getRequestAvailability(sorted, '事前'),
        事後: this.getRequestAvailability(sorted, '事後'),
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
