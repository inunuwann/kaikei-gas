export const STANDARD_REQUEST_TYPE = '通常請求';
export const REIMBURSEMENT_REQUEST_TYPE = '事後請求';
export const SETTLEMENT_TYPE = '通常精算';
export const APPLICATION_TYPE_OPTIONS = [
  STANDARD_REQUEST_TYPE,
  REIMBURSEMENT_REQUEST_TYPE,
] as const;
export const RECEIPT_LABEL = '領収書(レシート)';
export const PDF_MIME_TYPE = 'application/pdf';

export type ApplicationRequestType = (typeof APPLICATION_TYPE_OPTIONS)[number];
export type ExpenditureType = ApplicationRequestType | typeof SETTLEMENT_TYPE;

const EXPENDITURE_TYPE_ALIASES = {
  事前: STANDARD_REQUEST_TYPE,
  事後: REIMBURSEMENT_REQUEST_TYPE,
  精算: SETTLEMENT_TYPE,
  [STANDARD_REQUEST_TYPE]: STANDARD_REQUEST_TYPE,
  [REIMBURSEMENT_REQUEST_TYPE]: REIMBURSEMENT_REQUEST_TYPE,
  [SETTLEMENT_TYPE]: SETTLEMENT_TYPE,
} as const;

export interface AllowedItem {
  name: string;
  defaultPrice: number | string | null;
}

export interface ExpenditureRecord {
  rowIndex?: number;
  id: string;
  date: Date;
  dateKey?: string;
  groupId: string;
  groupName: string;
  type: string;
  status: string;
  amount: number;
  content: string;
  file: string;
  settlementFlag?: string;
  targetId?: string; // ← 精算元を紐づけるIDを追加
}

export interface InquiryRecord {
  rowIndex?: number;
  id: string;
  date: Date;
  dateKey?: string;
  group: string;
  sender: string;
  subject: string;
  message: string;
  status: string;
}

export function isApplicationRequestType(value: string | null): value is ApplicationRequestType {
  return APPLICATION_TYPE_OPTIONS.some((type) => type === value);
}

export function normalizeApplicationRequestType(
  value: string | null | undefined,
): ApplicationRequestType | null {
  const normalized = normalizeExpenditureType(value);
  return isApplicationRequestType(normalized) ? normalized : null;
}

export function normalizeExpenditureType(value: string | null | undefined): ExpenditureType | null {
  const trimmed = String(value ?? '').trim();
  return EXPENDITURE_TYPE_ALIASES[trimmed as keyof typeof EXPENDITURE_TYPE_ALIASES] ?? trimmed;
}

export function getExpenditureTypeLabel(value: string): string {
  return String(normalizeExpenditureType(value) ?? '').trim();
}

export function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function parseNumberish(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'ja', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function toDateKey(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const directMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (directMatch) {
      return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [date.getFullYear(), padNumber(date.getMonth() + 1), padNumber(date.getDate())].join('-');
}

export function stripDetailSuffix(content: string | null | undefined): string {
  return String(content ?? '')
    .replace(/\s*\(詳細あり\)\s*$/, '')
    .trim();
}

function padNumber(value: number): string {
  return String(value).padStart(2, '0');
}
