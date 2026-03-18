import {
  toDateKey,
  type AllowedItem,
  type ExpenditureRecord,
  type InquiryRecord,
} from './accounting-domain.ts';
import { createServerDebugLogger } from './debug-logger.ts';

const MASTER_CACHE_TTL_SECONDS = 300;
const ADMIN_EMAILS_CACHE_KEY = 'kaikei:master:admin-emails:v1';
const USERS_CACHE_KEY = 'kaikei:master:users:v1';
const ALLOWED_ITEMS_CACHE_KEY = 'kaikei:master:allowed-items:v1';
const repositoryLogger = createServerDebugLogger('AccountingSpreadsheetRepository');

export interface UserMasterRecord {
  email: string;
  groupId: string;
  groupName: string;
  budgetTotal: number;
}

export type AllowedItemsByGroup = Record<string, AllowedItem[]>;

interface CacheAdapter {
  get(key: string): string | null;
  put(key: string, value: string, expirationInSeconds: number): void;
  remove(key: string): void;
}

class JsonCacheStore {
  private readonly cache: CacheAdapter | null;
  private readonly ttlSeconds: number;

  constructor(
    cache: CacheAdapter | null = resolveScriptCache(),
    ttlSeconds = MASTER_CACHE_TTL_SECONDS,
  ) {
    this.cache = cache;
    this.ttlSeconds = ttlSeconds;
  }

  get<T>(key: string): T | null {
    if (!this.cache) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    try {
      return JSON.parse(cached) as T;
    } catch (_error) {
      this.cache.remove(key);
      return null;
    }
  }

  put<T>(key: string, value: T): void {
    if (!this.cache) {
      return;
    }

    this.cache.put(key, JSON.stringify(value), this.ttlSeconds);
  }
}

export class AccountingSpreadsheetRepository {
  private readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private readonly cacheStore: JsonCacheStore;
  private adminEmails: string[] | null = null;
  private users: UserMasterRecord[] | null = null;
  private groupNameMap: Map<string, string> | null = null;
  private allowedItemsByGroup: AllowedItemsByGroup | null = null;
  private expenditureRecords: ExpenditureRecord[] | null = null;
  private inquiryRecords: InquiryRecord[] | null = null;

  static openById(spreadsheetId: string): AccountingSpreadsheetRepository {
    const timer = repositoryLogger.startTimer('openById', { spreadsheetId });
    const repository = new AccountingSpreadsheetRepository(SpreadsheetApp.openById(spreadsheetId));
    timer.end();
    return repository;
  }

  constructor(
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
    cacheStore: JsonCacheStore = new JsonCacheStore(),
  ) {
    this.spreadsheet = spreadsheet;
    this.cacheStore = cacheStore;
  }

  getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    return this.spreadsheet;
  }

  isAdmin(email: string): boolean {
    return this.getAdminEmails().includes(email);
  }

  getAdminEmails(): string[] {
    const timer = repositoryLogger.startTimer('getAdminEmails');
    if (this.adminEmails) {
      timer.end({ source: 'memory', count: this.adminEmails.length });
      return this.adminEmails;
    }

    const cached = this.cacheStore.get<string[]>(ADMIN_EMAILS_CACHE_KEY);
    if (cached) {
      this.adminEmails = cached;
      timer.end({ source: 'cache', count: cached.length });
      return cached;
    }

    const loaded = extractAdminEmails(
      readSheetBodyValues(this.spreadsheet.getSheetByName('M_Admin')),
    );
    this.adminEmails = loaded;
    this.cacheStore.put(ADMIN_EMAILS_CACHE_KEY, loaded);
    timer.end({ source: 'sheet', count: loaded.length });
    return loaded;
  }

  getUsers(): UserMasterRecord[] {
    const timer = repositoryLogger.startTimer('getUsers');
    if (this.users) {
      timer.end({ source: 'memory', count: this.users.length });
      return this.users;
    }

    const cached = this.cacheStore.get<UserMasterRecord[]>(USERS_CACHE_KEY);
    if (cached) {
      this.users = cached;
      timer.end({ source: 'cache', count: cached.length });
      return cached;
    }

    const loaded = extractUsers(readSheetBodyValues(this.spreadsheet.getSheetByName('M_Users')));
    this.users = loaded;
    this.cacheStore.put(USERS_CACHE_KEY, loaded);
    timer.end({ source: 'sheet', count: loaded.length });
    return loaded;
  }

  findUserByEmail(email: string): UserMasterRecord | null {
    return this.getUsers().find((user) => user.email === email) ?? null;
  }

  getGroupNameMap(): Map<string, string> {
    if (this.groupNameMap) {
      return this.groupNameMap;
    }

    const groupNameMap = new Map<string, string>();
    this.getUsers().forEach((user) => {
      if (user.groupId && user.groupName && !groupNameMap.has(user.groupId)) {
        groupNameMap.set(user.groupId, user.groupName);
      }
    });

    this.groupNameMap = groupNameMap;
    return groupNameMap;
  }

  getAllowedItems(groupId: string): AllowedItem[] {
    return [...(this.getAllowedItemsByGroup()[groupId] ?? [])];
  }

  getAllowedItemsByGroup(): AllowedItemsByGroup {
    const timer = repositoryLogger.startTimer('getAllowedItemsByGroup');
    if (this.allowedItemsByGroup) {
      timer.end({
        source: 'memory',
        groupCount: Object.keys(this.allowedItemsByGroup).length,
      });
      return this.allowedItemsByGroup;
    }

    const cached = this.cacheStore.get<AllowedItemsByGroup>(ALLOWED_ITEMS_CACHE_KEY);
    if (cached) {
      this.allowedItemsByGroup = cached;
      timer.end({
        source: 'cache',
        groupCount: Object.keys(cached).length,
      });
      return cached;
    }

    const loaded = extractAllowedItemsByGroup(
      readSheetBodyValues(this.spreadsheet.getSheetByName('M_ItemMaster')),
    );
    this.allowedItemsByGroup = loaded;
    this.cacheStore.put(ALLOWED_ITEMS_CACHE_KEY, loaded);
    timer.end({
      source: 'sheet',
      groupCount: Object.keys(loaded).length,
    });
    return loaded;
  }

  getExpenditureRecords(): ExpenditureRecord[] {
    const timer = repositoryLogger.startTimer('getExpenditureRecords');
    if (this.expenditureRecords) {
      timer.end({ source: 'memory', count: this.expenditureRecords.length });
      return this.expenditureRecords;
    }

    const groupNameMap = this.getGroupNameMap();
    this.expenditureRecords = readSheetBodyValues(this.spreadsheet.getSheetByName('T_Expenditure'))
      .filter((row) => row[0])
      .map((row, index) => mapExpenditureRow(row, index + 2, groupNameMap));

    timer.end({ source: 'sheet', count: this.expenditureRecords.length });
    return this.expenditureRecords;
  }

  getInquiryRecords(): InquiryRecord[] {
    const timer = repositoryLogger.startTimer('getInquiryRecords');
    if (this.inquiryRecords) {
      timer.end({ source: 'memory', count: this.inquiryRecords.length });
      return this.inquiryRecords;
    }

    this.inquiryRecords = readSheetBodyValues(this.spreadsheet.getSheetByName('T_Inquiry'))
      .filter((row) => row[0])
      .map((row, index) => mapInquiryRow(row, index + 2));

    timer.end({ source: 'sheet', count: this.inquiryRecords.length });
    return this.inquiryRecords;
  }
}

export function extractAdminEmails(rows: unknown[][]): string[] {
  return rows.map((row) => String(row[1] ?? '').trim()).filter((email) => email.includes('@'));
}

export function extractUsers(rows: unknown[][]): UserMasterRecord[] {
  return rows
    .map((row) => ({
      email: String(row[0] ?? '').trim(),
      groupId: String(row[1] ?? '').trim(),
      groupName: String(row[2] ?? '').trim(),
      budgetTotal: Number(row[3]) || 0,
    }))
    .filter((user) => user.email);
}

export function extractAllowedItemsByGroup(rows: unknown[][]): AllowedItemsByGroup {
  return rows.reduce<AllowedItemsByGroup>((groups, row) => {
    const groupId = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim();

    if (!groupId || !name) {
      return groups;
    }

    if (!groups[groupId]) {
      groups[groupId] = [];
    }

    groups[groupId].push({
      name,
      defaultPrice: row[2] ?? null,
    });

    return groups;
  }, {});
}

function resolveScriptCache(): CacheAdapter | null {
  if (typeof CacheService === 'undefined') {
    return null;
  }

  return CacheService.getScriptCache();
}

function readSheetBodyValues(sheet: GoogleAppsScript.Spreadsheet.Sheet | null): unknown[][] {
  const timer = repositoryLogger.startTimer('readSheetBodyValues', {
    sheetName: sheet ? sheet.getName() : null,
  });
  if (!sheet) {
    timer.end({ rowCount: 0, lastRow: 0, lastColumn: 0 });
    return [];
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= 1 || lastColumn === 0) {
    timer.end({ rowCount: 0, lastRow, lastColumn });
    return [];
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  timer.end({ rowCount: rows.length, lastRow, lastColumn });
  return rows;
}

function mapExpenditureRow(
  row: unknown[],
  rowIndex: number,
  groupNameMap: Map<string, string>,
): ExpenditureRecord {
  const date = asDate(row[1]);
  const groupId = String(row[2] ?? '').trim();

  return {
    rowIndex,
    id: String(row[0] ?? ''),
    date,
    dateKey: toDateKey(date) ?? '',
    groupId,
    groupName: groupNameMap.get(groupId) ?? groupId,
    type: String(row[3] ?? ''),
    status: String(row[4] ?? ''),
    amount: Number(row[5]) || 0,
    content: String(row[6] ?? ''),
    file: String(row[7] ?? 'なし'),
    settlementFlag: String(row[8] ?? ''),
  };
}

function mapInquiryRow(row: unknown[], rowIndex: number): InquiryRecord {
  const date = asDate(row[1]);

  return {
    rowIndex,
    id: String(row[0] ?? ''),
    date,
    dateKey: toDateKey(date) ?? '',
    group: String(row[2] ?? ''),
    sender: String(row[3] ?? ''),
    subject: String(row[4] ?? ''),
    message: String(row[5] ?? ''),
    status: String(row[6] ?? ''),
  };
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}
