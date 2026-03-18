import {
  PDF_MIME_TYPE,
  type AllowedItem,
  type ExpenditureRecord,
  type InquiryRecord,
} from './accounting-domain.ts';
import { AdminDashboardService, type AdminSearchCriteriaInput } from './admin-dashboard-service.ts';
import { ExpenditureRequestPolicy } from './expenditure-policy.ts';
import { UserFormViewModelFactory } from './user-form-view-model.ts';

const SS_ID = '1-3Fj7Y6bRYnU7RyNkfI76YuDmG-kpaXJuelLgzGd6fY';
const SCRIPT_TIME_ZONE = 'Asia/Tokyo';

const adminDashboardService = new AdminDashboardService();

interface UserStatusViewData {
  email: string;
  groupId: string;
  groupName: string;
  budgetTotal: number;
  remainingBudget: number;
  allowedItems: AllowedItem[];
  history: Array<{
    id: string;
    date: string;
    type: string;
    status: string;
    amount: number;
    content: string;
  }>;
  unsettledItem: {
    id: string;
    amount: number;
    content: string;
    date: string;
  } | null;
  requestAvailability: {
    事前: {
      allowed: boolean;
      reason: string | null;
      activeRecordId: string | null;
    };
    事後: {
      allowed: boolean;
      reason: string | null;
      activeRecordId: string | null;
    };
  };
  formBootstrap: ReturnType<typeof UserFormViewModelFactory.buildBootstrap>;
}

interface FormSubmissionInput {
  type?: string;
  totalAmount?: number | string;
  itemsJson?: string;
  fileName?: string | null;
  fileData?: string | null;
  mimeType?: string | null;
}

interface InquiryFormInput {
  subject?: string;
  message?: string;
}

function doGet(e: GoogleAppsScript.Events.DoGet) {
  const email = Session.getActiveUser().getEmail();
  const roleParam = e?.parameter?.role ?? '';
  const scriptUrl = ScriptApp.getService().getUrl();

  const adminUser = isAdmin(email);
  const userInfo = getUserStatus(email);
  const normalUser = userInfo !== null;

  if (adminUser && normalUser) {
    if (roleParam === 'admin') {
      return renderAdmin(email);
    }

    if (roleParam === 'user' && userInfo) {
      return renderUser(userInfo);
    }

    const template = HtmlService.createTemplateFromFile('select_role');
    template.url = scriptUrl;
    template.email = email;
    return template
      .evaluate()
      .setTitle('権限選択')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  if (adminUser) {
    return renderAdmin(email);
  }

  if (userInfo) {
    return renderUser(userInfo);
  }

  return HtmlService.createHtmlOutput(
    '<h2>エラー：アクセス権限がありません</h2><p>担当者マスタまたは管理者マスタに登録されていません。</p>',
  );
}

function isAdmin(email: string): boolean {
  return getAdminEmails().includes(email);
}

function renderAdmin(email: string) {
  const template = HtmlService.createTemplateFromFile('admin');
  template.data = { email };
  return template
    .evaluate()
    .setTitle('会計管理ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderUser(userInfo: UserStatusViewData) {
  const template = HtmlService.createTemplateFromFile('index');
  template.data = userInfo;
  return template
    .evaluate()
    .setTitle('会計申請システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAdminDashboardData(criteriaInput: AdminSearchCriteriaInput = {}) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const expenditures = loadExpenditureRecords(ss);
  const inquiries = loadInquiryRecords(ss);

  return {
    expenditures: adminDashboardService
      .filterAndSort(expenditures, criteriaInput)
      .map((record) => ({
        rowIndex: record.rowIndex,
        id: record.id,
        date: formatJstDate(record.date),
        group: record.groupName,
        type: record.type,
        status: record.status,
        amount: record.amount,
        content: record.content,
        file: record.file,
      })),
    inquiries: [...inquiries]
      .sort((left, right) => right.date.getTime() - left.date.getTime())
      .map((record) => ({
        rowIndex: record.rowIndex,
        id: record.id,
        date: formatJstDate(record.date),
        group: record.group,
        sender: record.sender,
        subject: record.subject,
        message: record.message,
        status: record.status,
      })),
    filterOptions: adminDashboardService.getFilterOptions(expenditures),
    criteria: adminDashboardService.normalizeCriteria(criteriaInput),
  };
}

function updateStatus(type: string, rowIndex: number, newStatus: string) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;
  let columnIndex = 0;

  if (type === 'expenditure') {
    sheet = ss.getSheetByName('T_Expenditure');
    columnIndex = 5;
  } else if (type === 'inquiry') {
    sheet = ss.getSheetByName('T_Inquiry');
    columnIndex = 7;
  }

  if (!sheet || columnIndex === 0) {
    return { success: false };
  }

  sheet.getRange(rowIndex, columnIndex).setValue(newStatus);
  return { success: true };
}

function getUserStatus(email: string): UserStatusViewData | null {
  const ss = SpreadsheetApp.openById(SS_ID);
  const usersSheet = ss.getSheetByName('M_Users');
  if (!usersSheet) {
    return null;
  }

  const usersData = usersSheet.getDataRange().getValues();
  const userRow = usersData.slice(1).find((row) => row[0] === email);
  if (!userRow) {
    return null;
  }

  const groupId = String(userRow[1]);
  const budgetTotal = Number(userRow[3]) || 0;
  const groupRecords = loadExpenditureRecords(ss).filter((record) => record.groupId === groupId);
  const summary = ExpenditureRequestPolicy.summarizeGroupRecords(
    groupRecords,
    budgetTotal,
    formatJstDate,
  );

  return {
    email: String(userRow[0]),
    groupId,
    groupName: String(userRow[2]),
    budgetTotal,
    remainingBudget: summary.remainingBudget,
    allowedItems: loadAllowedItems(ss, groupId),
    history: summary.history,
    unsettledItem: summary.unsettledItem,
    requestAvailability: summary.requestAvailability,
    formBootstrap: UserFormViewModelFactory.buildBootstrap({
      requestAvailability: summary.requestAvailability,
      unsettledItem: summary.unsettledItem,
    }),
  };
}

function getAdminEmails(): string[] {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('M_Admin');
  if (!sheet) {
    return [];
  }

  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .map((row) => String(row[1] ?? '').trim())
    .filter((email) => email.includes('@'));
}

function processForm(formObj: FormSubmissionInput) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const userEmail = Session.getActiveUser().getEmail();
    const userInfo = getUserStatus(userEmail);
    if (!userInfo) {
      throw new Error('利用者情報が見つかりません。');
    }

    const requestType = String(formObj.type ?? '').trim();
    const totalAmount = Number(formObj.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error('申請金額が不正です。');
    }

    const items = parseSubmittedItems(formObj.itemsJson);
    if (items.length === 0) {
      throw new Error('少なくとも1つの品目を入力してください。');
    }

    const ss = SpreadsheetApp.openById(SS_ID);
    const expenditureSheet = ss.getSheetByName('T_Expenditure');
    if (!expenditureSheet) {
      throw new Error('T_Expenditure シートが見つかりません。');
    }

    const groupRecords = loadExpenditureRecords(ss).filter(
      (record) => record.groupId === userInfo.groupId,
    );

    if (requestType === '精算') {
      ExpenditureRequestPolicy.assertCanStartSettlement(groupRecords);
    } else {
      ExpenditureRequestPolicy.assertCanCreateRequest(groupRecords, requestType);
    }

    if (requestType !== '精算' && totalAmount > userInfo.remainingBudget) {
      throw new Error('予算超過エラー');
    }

    ExpenditureRequestPolicy.validateAttachment(requestType, {
      fileName: formObj.fileName,
      mimeType: formObj.mimeType,
    });

    const now = new Date();
    const newId = `EXP-${Utilities.formatDate(now, SCRIPT_TIME_ZONE, 'yyyyMMdd-HHmmss')}`;
    const fileUrl = saveAttachmentFile(newId, formObj);
    const simpleContent = items.map((item) => item.item).join(', ');
    const initialStatus = requestType === '事前' ? '未精算' : '申請中';

    expenditureSheet.appendRow([
      newId,
      now,
      userInfo.groupId,
      requestType,
      initialStatus,
      totalAmount,
      `${simpleContent} (詳細あり)`,
      fileUrl,
      '未',
    ]);

    const mailBody = [
      `■申請ID: ${newId}`,
      `■団体名: ${userInfo.groupName}`,
      `■タイプ: ${requestType}`,
      `■合計: ${totalAmount.toLocaleString()}円`,
    ].join('\n');

    GmailApp.sendEmail(userInfo.email, `【申請完了】${newId}`, mailBody);

    const adminEmails = getAdminEmails();
    if (adminEmails.length > 0) {
      GmailApp.sendEmail(
        adminEmails.join(','),
        `【新規申請】${userInfo.groupName}`,
        `${mailBody}\n\n確認: https://docs.google.com/spreadsheets/d/${SS_ID}/edit`,
      );
    }

    return { success: true, message: `申請完了 ID: ${newId}` };
  } catch (error) {
    return {
      success: false,
      message: `エラー: ${getErrorMessage(error)}`,
    };
  } finally {
    lock.releaseLock();
  }
}

function processInquiry(formObj: InquiryFormInput) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: '処理中です。' };
  }

  try {
    const email = Session.getActiveUser().getEmail();
    const userInfo = getUserStatus(email);
    if (!userInfo) {
      throw new Error('利用者情報が見つかりません。');
    }

    const subject = String(formObj.subject ?? '').trim();
    const message = String(formObj.message ?? '').trim();
    if (!subject || !message) {
      throw new Error('件名と本文を入力してください。');
    }

    const ss = SpreadsheetApp.openById(SS_ID);
    const inquirySheet = ss.getSheetByName('T_Inquiry');
    if (!inquirySheet) {
      throw new Error('T_Inquiry シートが見つかりません。');
    }

    const now = new Date();
    const inquiryId = `INQ-${Utilities.formatDate(now, SCRIPT_TIME_ZONE, 'yyyyMMdd-HHmmss')}`;

    inquirySheet.appendRow([inquiryId, now, userInfo.groupName, email, subject, message, '未対応']);

    const bodyContent = [
      `■ID: ${inquiryId}`,
      `■送信者: ${userInfo.groupName}`,
      `■件名: ${subject}`,
      '',
      message,
    ].join('\n');

    const adminEmails = getAdminEmails();
    if (adminEmails.length > 0) {
      GmailApp.sendEmail(adminEmails.join(','), `【問い合わせ】${userInfo.groupName}`, bodyContent);
    }

    GmailApp.sendEmail(email, '【受付完了】お問い合わせ', bodyContent);

    return { success: true, message: '送信しました。' };
  } catch (error) {
    return {
      success: false,
      message: `エラー: ${getErrorMessage(error)}`,
    };
  } finally {
    lock.releaseLock();
  }
}

function include(filename: string) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function loadExpenditureRecords(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): ExpenditureRecord[] {
  const sheet = ss.getSheetByName('T_Expenditure');
  if (!sheet) {
    return [];
  }

  const groupNameMap = buildGroupNameMap(ss);

  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter((row) => row[0])
    .map((row, index) => mapExpenditureRow(row, index + 2, groupNameMap));
}

function loadInquiryRecords(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): InquiryRecord[] {
  const sheet = ss.getSheetByName('T_Inquiry');
  if (!sheet) {
    return [];
  }

  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter((row) => row[0])
    .map((row, index) => {
      const date = asDate(row[1]);
      return {
        rowIndex: index + 2,
        id: String(row[0]),
        date,
        dateKey: formatJstDateKey(date),
        group: String(row[2] ?? ''),
        sender: String(row[3] ?? ''),
        subject: String(row[4] ?? ''),
        message: String(row[5] ?? ''),
        status: String(row[6] ?? ''),
      };
    });
}

function loadAllowedItems(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  groupId: string,
): AllowedItem[] {
  const sheet = ss.getSheetByName('M_ItemMaster');
  if (!sheet) {
    return [];
  }

  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter((row) => String(row[0]) === groupId)
    .map((row) => ({
      name: String(row[1] ?? ''),
      defaultPrice: row[2] ?? null,
    }))
    .filter((item) => item.name);
}

function buildGroupNameMap(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): Map<string, string> {
  const usersSheet = ss.getSheetByName('M_Users');
  const groupMap = new Map<string, string>();

  if (!usersSheet) {
    return groupMap;
  }

  usersSheet
    .getDataRange()
    .getValues()
    .slice(1)
    .forEach((row) => {
      const groupId = String(row[1] ?? '').trim();
      const groupName = String(row[2] ?? '').trim();
      if (groupId && groupName) {
        groupMap.set(groupId, groupName);
      }
    });

  return groupMap;
}

function mapExpenditureRow(
  row: unknown[],
  rowIndex: number,
  groupNameMap: Map<string, string>,
): ExpenditureRecord {
  const date = asDate(row[1]);
  const groupId = String(row[2] ?? '');

  return {
    rowIndex,
    id: String(row[0]),
    date,
    dateKey: formatJstDateKey(date),
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

function parseSubmittedItems(itemsJson: string | undefined) {
  const parsed = JSON.parse(itemsJson ?? '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('申請内容の形式が正しくありません。');
  }

  return parsed
    .map((item) => ({
      item: String(item?.item ?? '').trim(),
      price: Number(item?.price ?? 0),
      qty: Number(item?.qty ?? 0),
      subtotal: Number(item?.subtotal ?? 0),
    }))
    .filter((item) => item.item);
}

function saveAttachmentFile(requestId: string, formObj: FormSubmissionInput): string {
  if (!formObj.fileData || !formObj.fileName) {
    return 'なし';
  }

  const fileName = String(formObj.fileName).trim();
  const mimeType = String(formObj.mimeType ?? PDF_MIME_TYPE);
  const blob = Utilities.newBlob(Utilities.base64Decode(formObj.fileData), mimeType, fileName);

  return DriveApp.getRootFolder().createFile(blob).setName(`${requestId}_${fileName}`).getUrl();
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function formatJstDate(date: Date): string {
  return Utilities.formatDate(date, SCRIPT_TIME_ZONE, 'yyyy/MM/dd');
}

function formatJstDateKey(date: Date): string {
  return Utilities.formatDate(date, SCRIPT_TIME_ZONE, 'yyyy-MM-dd');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
