import {
  normalizeExpenditureType,
  PDF_MIME_TYPE,
  SETTLEMENT_TYPE,
  STANDARD_REQUEST_TYPE,
  type AllowedItem,
  type ExpenditureRecord,
  type InquiryRecord,
  type RequestAvailabilityMap,
} from './accounting-domain.ts';
import { AdminDashboardService, type AdminSearchCriteriaInput } from './admin-dashboard-service.ts';
import {
  AccountingSpreadsheetRepository,
  type UserMasterRecord,
} from './accounting-spreadsheet-repository.ts';
import { createServerDebugLogger, maskEmail } from './debug-logger.ts';
import { ExpenditureRequestPolicy } from './expenditure-policy.ts';
import { UserFormViewModelFactory } from './user-form-view-model.ts';

const SS_ID = '1-3Fj7Y6bRYnU7RyNkfI76YuDmG-kpaXJuelLgzGd6fY';
const SCRIPT_TIME_ZONE = 'Asia/Tokyo';

const adminDashboardService = new AdminDashboardService();
const serverLogger = createServerDebugLogger('code');

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
  requestAvailability: RequestAvailabilityMap;
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
  const logger = serverLogger.child('doGet', {
    email: maskEmail(email),
    roleParam,
  });
  const timer = logger.startTimer('request');

  try {
    const scriptUrl = ScriptApp.getService().getUrl();
    const repository = AccountingSpreadsheetRepository.openById(SS_ID);
    const adminUser = repository.isAdmin(email);
    const userRecord = repository.findUserByEmail(email);
    const normalUser = userRecord !== null;
    logger.log('role-resolved', {
      adminUser,
      normalUser,
    });

    if (adminUser && normalUser) {
      if (roleParam === 'admin') {
        timer.end({ target: 'admin' });
        return renderAdmin(email);
      }

      if (roleParam === 'user' && userRecord) {
        timer.end({ target: 'user' });
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
      timer.end({ target: 'admin-only' });
      return renderAdmin(email);
    }

    if (userRecord) {
      timer.end({ target: 'user-only' });
      return renderUser(buildUserStatusViewData(repository, userRecord));
    }

    timer.end({ target: 'no-access' });
    return HtmlService.createHtmlOutput(
      '<h2>エラー：アクセス権限がありません</h2><p>担当者マスタまたは管理者マスタに登録されていません。</p>',
    );
  } catch (error) {
    timer.fail(error);
    throw error;
  }
}

function renderAdmin(email: string) {
  const logger = serverLogger.child('renderAdmin', {
    email: maskEmail(email),
  });
  const timer = logger.startTimer('render');
  const template = HtmlService.createTemplateFromFile('admin');
  const bootstrap = getAdminDashboardBootstrap();
  template.data = {
    email,
    bootstrap,
  };
  logger.log('bootstrap-prepared', {
    expenditureCount: bootstrap.expenditures.length,
    groupFilterCount: bootstrap.filterOptions.groups.length,
    typeFilterCount: bootstrap.filterOptions.types.length,
  });
  timer.end();
  return template
    .evaluate()
    .setTitle('会計管理ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderUser(userInfo: UserStatusViewData) {
  serverLogger
    .child('renderUser', {
      email: maskEmail(userInfo.email),
      groupId: userInfo.groupId,
      historyCount: userInfo.history.length,
    })
    .log('render');
  const template = HtmlService.createTemplateFromFile('index');
  template.data = userInfo;
  return template
    .evaluate()
    .setTitle('会計申請システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAdminDashboardBootstrap() {
  const logger = serverLogger.child('getAdminDashboardBootstrap');
  const timer = logger.startTimer('load');
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const expenditures = repository.getExpenditureRecords();
  const response = {
    expenditures: mapExpenditureViewRecords(expenditures),
    filterOptions: adminDashboardService.getFilterOptions(expenditures),
    criteria: adminDashboardService.normalizeCriteria(),
  };
  timer.end({
    expenditureCount: response.expenditures.length,
    groupFilterCount: response.filterOptions.groups.length,
    typeFilterCount: response.filterOptions.types.length,
  });
  return response;
}

function getInquiryDashboardData() {
  const logger = serverLogger.child('getInquiryDashboardData');
  const timer = logger.startTimer('load');
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const response = {
    inquiries: mapInquiryViewRecords(repository.getInquiryRecords()),
  };
  timer.end({
    inquiryCount: response.inquiries.length,
  });
  return response;
}

function getAdminDashboardData(criteriaInput: AdminSearchCriteriaInput = {}) {
  const logger = serverLogger.child('getAdminDashboardData');
  const timer = logger.startTimer('load', {
    criteriaInput,
  });
  const repository = AccountingSpreadsheetRepository.openById(SS_ID);
  const expenditures = repository.getExpenditureRecords();
  const response = {
    expenditures: mapExpenditureViewRecords(
      adminDashboardService.filterAndSort(expenditures, criteriaInput),
    ),
    inquiries: mapInquiryViewRecords(repository.getInquiryRecords()),
    filterOptions: adminDashboardService.getFilterOptions(expenditures),
    criteria: adminDashboardService.normalizeCriteria(criteriaInput),
  };
  timer.end({
    filteredExpenditureCount: response.expenditures.length,
    inquiryCount: response.inquiries.length,
  });
  return response;
}

function updateStatus(type: string, rowIndex: number, newStatus: string) {
  const logger = serverLogger.child('updateStatus', {
    type,
    rowIndex,
    newStatus,
  });
  const timer = logger.startTimer('update');
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
    timer.end({ success: false });
    return { success: false };
  }

  sheet.getRange(rowIndex, columnIndex).setValue(newStatus);
  timer.end({ success: true, sheetName: sheet.getName() });
  return { success: true };
}

function getUserStatus(
  email: string,
  repository: AccountingSpreadsheetRepository = AccountingSpreadsheetRepository.openById(SS_ID),
): UserStatusViewData | null {
  const logger = serverLogger.child('getUserStatus', {
    email: maskEmail(email),
  });
  const timer = logger.startTimer('load');
  const userRecord = repository.findUserByEmail(email);
  if (!userRecord) {
    timer.end({ found: false });
    return null;
  }

  const result = buildUserStatusViewData(repository, userRecord);
  timer.end({
    found: true,
    historyCount: result.history.length,
    allowedItemCount: result.allowedItems.length,
  });
  return result;
}

function buildUserStatusViewData(
  repository: AccountingSpreadsheetRepository,
  userRecord: UserMasterRecord,
): UserStatusViewData {
  const logger = serverLogger.child('buildUserStatusViewData', {
    email: maskEmail(userRecord.email),
    groupId: userRecord.groupId,
  });
  const timer = logger.startTimer('build');
  const groupRecords = repository
    .getExpenditureRecords()
    .filter((record) => record.groupId === userRecord.groupId);
  const summary = ExpenditureRequestPolicy.summarizeGroupRecords(
    groupRecords,
    userRecord.budgetTotal,
    formatJstDate,
  );

  const viewData = {
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
  timer.end({
    groupRecordCount: groupRecords.length,
    allowedItemCount: viewData.allowedItems.length,
    historyCount: viewData.history.length,
    hasUnsettledItem: Boolean(viewData.unsettledItem),
  });
  return viewData;
}

function getAdminEmails(
  repository: AccountingSpreadsheetRepository = AccountingSpreadsheetRepository.openById(SS_ID),
): string[] {
  return repository.getAdminEmails();
}

function processForm(formObj: FormSubmissionInput) {
  const logger = serverLogger.child('processForm');
  const timer = logger.startTimer('submit');
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const userEmail = Session.getActiveUser().getEmail();
    const repository = AccountingSpreadsheetRepository.openById(SS_ID);
    const userInfo = getUserStatus(userEmail, repository);
    if (!userInfo) {
      throw new Error('利用者情報が見つかりません。');
    }

    const requestType = normalizeExpenditureType(String(formObj.type ?? '').trim());
    const totalAmount = Number(formObj.totalAmount);
    logger.log('input-parsed', {
      email: maskEmail(userEmail),
      requestType,
      totalAmount,
      hasFile: Boolean(formObj.fileName || formObj.mimeType),
    });
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error('申請金額が不正です。');
    }

    const items = parseSubmittedItems(formObj.itemsJson);
    logger.log('items-parsed', {
      itemCount: items.length,
    });
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

    if (requestType === SETTLEMENT_TYPE) {
      ExpenditureRequestPolicy.assertCanStartSettlement(groupRecords);
    } else {
      ExpenditureRequestPolicy.assertCanCreateRequest(groupRecords, requestType);
    }

    if (requestType !== SETTLEMENT_TYPE && totalAmount > userInfo.remainingBudget) {
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
    const initialStatus = requestType === STANDARD_REQUEST_TYPE ? '未精算' : '申請中';

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

    timer.end({
      success: true,
      requestId: newId,
      itemCount: items.length,
      adminEmailCount: adminEmails.length,
    });
    return { success: true, message: `申請完了 ID: ${newId}` };
  } catch (error) {
    timer.fail(error);
    return {
      success: false,
      message: `エラー: ${getErrorMessage(error)}`,
    };
  } finally {
    lock.releaseLock();
  }
}

function processInquiry(formObj: InquiryFormInput) {
  const logger = serverLogger.child('processInquiry');
  const timer = logger.startTimer('submit');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    timer.end({ success: false, reason: 'lock-timeout' });
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
    logger.log('input-parsed', {
      email: maskEmail(email),
      subjectLength: subject.length,
      messageLength: message.length,
    });
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

    timer.end({
      success: true,
      inquiryId,
      adminEmailCount: adminEmails.length,
    });
    return { success: true, message: '送信しました。' };
  } catch (error) {
    timer.fail(error);
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
  const logger = serverLogger.child('parseSubmittedItems');
  const timer = logger.startTimer('parse');
  const parsed = JSON.parse(itemsJson ?? '[]');
  if (!Array.isArray(parsed)) {
    timer.fail(new Error('itemsJson is not array'));
    throw new Error('申請内容の形式が正しくありません。');
  }

  const items = parsed
    .map((item) => ({
      item: String(item?.item ?? '').trim(),
      price: Number(item?.price ?? 0),
      qty: Number(item?.qty ?? 0),
      subtotal: Number(item?.subtotal ?? 0),
    }))
    .filter((item) => item.item);
  timer.end({
    inputCount: parsed.length,
    outputCount: items.length,
  });
  return items;
}

function saveAttachmentFile(requestId: string, formObj: FormSubmissionInput): string {
  const logger = serverLogger.child('saveAttachmentFile', {
    requestId,
  });
  const timer = logger.startTimer('save', {
    hasFileData: Boolean(formObj.fileData),
    fileName: formObj.fileName ?? null,
    mimeType: formObj.mimeType ?? null,
  });
  if (!formObj.fileData || !formObj.fileName) {
    timer.end({ stored: false });
    return 'なし';
  }

  const fileName = String(formObj.fileName).trim();
  const mimeType = String(formObj.mimeType ?? PDF_MIME_TYPE);
  const blob = Utilities.newBlob(Utilities.base64Decode(formObj.fileData), mimeType, fileName);

  const url = DriveApp.getRootFolder()
    .createFile(blob)
    .setName(`${requestId}_${fileName}`)
    .getUrl();
  timer.end({ stored: true, url });
  return url;
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
