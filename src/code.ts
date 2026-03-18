import {
  PDF_MIME_TYPE,
  type AllowedItem,
  type ExpenditureRecord,
  type InquiryRecord,
} from './accounting-domain.ts';
import { AdminDashboardService, type AdminSearchCriteriaInput } from './admin-dashboard-service.ts';
import {
  AccountingSpreadsheetRepository,
  type UserMasterRecord,
} from './accounting-spreadsheet-repository.ts';
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
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const adminUser = repository.isAdmin(email);
  const userRecord = repository.findUserByEmail(email);
  const normalUser = userRecord !== null;

  if (adminUser && normalUser) {
    if (roleParam === 'admin') {
      return renderAdmin(email);
    }

    if (roleParam === 'user' && userRecord) {
      return renderUser(buildUserStatusViewData(repository, userRecord));
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

  if (userRecord) {
    return renderUser(buildUserStatusViewData(repository, userRecord));
  }

  return HtmlService.createHtmlOutput(
    '<h2>エラー：アクセス権限がありません</h2><p>担当者マスタまたは管理者マスタに登録されていません。</p>',
  );
}

function renderAdmin(email: string) {
  const template = HtmlService.createTemplateFromFile('admin');
  template.data = {
    email,
    bootstrap: getAdminDashboardBootstrap(),
  };
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

function getAdminDashboardBootstrap() {
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const expenditures = repository.getExpenditureRecords();

  return {
    expenditures: mapExpenditureViewRecords(expenditures),
    filterOptions: adminDashboardService.getFilterOptions(expenditures),
    criteria: adminDashboardService.normalizeCriteria(),
  };
}

function getInquiryDashboardData() {
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);

  return {
    inquiries: mapInquiryViewRecords(repository.getInquiryRecords()),
  };
}

function getAdminDashboardData(criteriaInput: AdminSearchCriteriaInput = {}) {
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const expenditures = repository.getExpenditureRecords();

  return {
    expenditures: mapExpenditureViewRecords(
      adminDashboardService.filterAndSort(expenditures, criteriaInput),
    ),
    inquiries: mapInquiryViewRecords(repository.getInquiryRecords()),
    filterOptions: adminDashboardService.getFilterOptions(expenditures),
    criteria: adminDashboardService.normalizeCriteria(criteriaInput),
  };
}

function updateStatus(type: string, rowIndex: number, newStatus: string) {
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const ss = repository.getSpreadsheet();
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

function getUserStatus(
  email: string,
  repository: AccountingSpreadsheetRepository = AccountingSpreadsheetRepository.openById(SS_ID),
): UserStatusViewData | null {
  const userRecord = repository.findUserByEmail(email);
  if (!userRecord) {
    return null;
  }

  return buildUserStatusViewData(repository, userRecord);
}

function buildUserStatusViewData(
  repository: AccountingSpreadsheetRepository,
  userRecord: UserMasterRecord,
): UserStatusViewData {
  const groupRecords = repository
    .getExpenditureRecords()
    .filter((record) => record.groupId === userRecord.groupId);
  const summary = ExpenditureRequestPolicy.summarizeGroupRecords(
    groupRecords,
    userRecord.budgetTotal,
    formatJstDate,
  );

  return {
    email: userRecord.email,
    groupId: userRecord.groupId,
    groupName: userRecord.groupName,
    budgetTotal: userRecord.budgetTotal,
    remainingBudget: summary.remainingBudget,
    allowedItems: repository.getAllowedItems(userRecord.groupId),
    history: summary.history,
    unsettledItem: summary.unsettledItem,
    requestAvailability: summary.requestAvailability,
    formBootstrap: UserFormViewModelFactory.buildBootstrap({
      requestAvailability: summary.requestAvailability,
      unsettledItem: summary.unsettledItem,
    }),
  };
}

function getAdminEmails(
  repository: AccountingSpreadsheetRepository = AccountingSpreadsheetRepository.openById(SS_ID),
): string[] {
  return repository.getAdminEmails();
}

function processForm(formObj: FormSubmissionInput) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const userEmail = Session.getActiveUser().getEmail();
    const repository = AccountingSpreadsheetRepository.openById(SS_ID);
    const userInfo = getUserStatus(userEmail, repository);
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

    const ss = repository.getSpreadsheet();
    const expenditureSheet = ss.getSheetByName('T_Expenditure');
    if (!expenditureSheet) {
      throw new Error('T_Expenditure シートが見つかりません。');
    }

    const groupRecords = repository
      .getExpenditureRecords()
      .filter((record) => record.groupId === userInfo.groupId);

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

    const adminEmails = getAdminEmails(repository);
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
    const repository = AccountingSpreadsheetRepository.openById(SS_ID);
    const userInfo = getUserStatus(email, repository);
    if (!userInfo) {
      throw new Error('利用者情報が見つかりません。');
    }

    const subject = String(formObj.subject ?? '').trim();
    const message = String(formObj.message ?? '').trim();
    if (!subject || !message) {
      throw new Error('件名と本文を入力してください。');
    }

    const ss = repository.getSpreadsheet();
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

    const adminEmails = getAdminEmails(repository);
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

// GAS はエントリポイントをグローバル関数として解決する。
// bundle 後も公開関数が残るように明示的に紐付ける。
Object.assign(globalThis, {
  doGet,
  getAdminDashboardBootstrap,
  getAdminDashboardData,
  getInquiryDashboardData,
  updateStatus,
  processForm,
  processInquiry,
  include,
});

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

function formatJstDate(date: Date): string {
  return Utilities.formatDate(date, SCRIPT_TIME_ZONE, 'yyyy/MM/dd');
}

function mapExpenditureViewRecords(records: ExpenditureRecord[]) {
  return records.map((record) => ({
    rowIndex: record.rowIndex,
    id: record.id,
    date: formatJstDate(record.date),
    group: record.groupName,
    type: record.type,
    status: record.status,
    amount: record.amount,
    content: record.content,
    file: record.file,
  }));
}

function mapInquiryViewRecords(records: InquiryRecord[]) {
  return [...records]
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
    }));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
