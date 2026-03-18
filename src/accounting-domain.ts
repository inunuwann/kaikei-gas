export const APPLICATION_TYPE_OPTIONS = ['事後', '事前'] as const;
export const RECEIPT_LABEL = '領収書(レシート)';
export const PDF_MIME_TYPE = 'application/pdf';

export type ApplicationRequestType = (typeof APPLICATION_TYPE_OPTIONS)[number];
export type ExpenditureType = ApplicationRequestType | '精算';

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

export interface UserHistoryEntry {
  id: string;
  date: string;
  type: string;
  status: string;
  amount: number;
  content: string;
}

export interface UnsettledItem {
  id: string;
  amount: number;
  content: string;
  date: string;
}

export interface RequestAvailability {
  allowed: boolean;
  reason: string | null;
  activeRecordId: string | null;
}

export type RequestAvailabilityMap = Record<ApplicationRequestType, RequestAvailability>;

export interface AttachmentPayload {
  fileName?: string | null;
  mimeType?: string | null;
}

export interface UserFormTypeOption {
  value: ApplicationRequestType;
  label: string;
  allowed: boolean;
  reason: string | null;
}

export interface UserFormBootstrap {
  receiptLabel: string;
  fileAccept: string;
  applicationTypes: UserFormTypeOption[];
  requestAvailability: RequestAvailabilityMap;
}

export function isApplicationRequestType(value: string): value is ApplicationRequestType {
  return APPLICATION_TYPE_OPTIONS.some((type) => type === value);
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

export function stripDetailSuffix(content: string): string {
  return String(content ?? '')
    .replace(/\s*\(詳細あり\)\s*$/, '')
    .trim();
}

function padNumber(value: number): string {
  return String(value).padStart(2, '0');
}
