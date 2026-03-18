// スプレッドシートID
const SS_ID = '1-3Fj7Y6bRYnU7RyNkfI76YuDmG-kpaXJuelLgzGd6fY';

/* ==============================================
 * 1. 画面表示 (doGet) - 権限分岐ロジック
 * ============================================== */
function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  
  // 1. 権限チェック
  const is_Admin = isAdmin(email); // ★ここがエラーの原因でした（関数を追加しました）
  const user_Info = getUserStatus(email);
  const is_User = (user_Info !== null);

  // 2. URLパラメータ取得
  const roleParam = e.parameter.role;
  const scriptUrl = ScriptApp.getService().getUrl();

  // --- A. 両方の権限を持っている場合 ---
  if (is_Admin && is_User) {
    if (roleParam === 'admin') {
      return renderAdmin(email);
    } else if (roleParam === 'user') {
      return renderUser(user_Info);
    } else {
      // 選択画面を表示
      const template = HtmlService.createTemplateFromFile('select_role');
      template.url = scriptUrl;
      template.email = email;
      return template.evaluate().setTitle('権限選択').addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
  }

  // --- B. 管理者のみ ---
  if (is_Admin) return renderAdmin(email);

  // --- C. 一般ユーザーのみ ---
  if (is_User) return renderUser(user_Info);

  // --- D. 権限なし ---
  return HtmlService.createHtmlOutput("<h2>エラー：アクセス権限がありません</h2><p>担当者マスタまたは管理者マスタに登録されていません。</p>");
}

// ★追加：管理者判定関数（これが抜けていました）
function isAdmin(email) {
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email);
}

// ヘルパー: 管理者画面
function renderAdmin(email) {
  const template = HtmlService.createTemplateFromFile('admin');
  template.data = { email: email };
  return template.evaluate()
      .setTitle('会計管理ダッシュボード')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ヘルパー: ユーザー画面
function renderUser(userInfo) {
  const template = HtmlService.createTemplateFromFile('index');
  template.data = userInfo;
  return template.evaluate()
      .setTitle('会計申請システム V3')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ==============================================
 * 2. 管理者用データ取得・更新処理
 * ============================================== */
function getAdminDashboardData() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const tExp = ss.getSheetByName('T_Expenditure');
  const tInq = ss.getSheetByName('T_Inquiry');
  
  // 支出データ
  const expRows = tExp.getDataRange().getValues().slice(1);
  const expenditures = expRows.map((row, i) => ({
    rowIndex: i + 2,
    id: row[0],
    date: Utilities.formatDate(new Date(row[1]), 'JST', 'yyyy/MM/dd'),
    group: getGroupNameById(row[2]),
    type: row[3],
    status: row[4],
    amount: row[5],
    content: row[6],
    file: row[7]
  })).reverse();

  // 問い合わせデータ
  let inquiries = [];
  if (tInq) {
    const inqRows = tInq.getDataRange().getValues().slice(1);
    inquiries = inqRows.map((row, i) => ({
      rowIndex: i + 2,
      id: row[0],
      date: Utilities.formatDate(new Date(row[1]), 'JST', 'yyyy/MM/dd'),
      group: row[2],
      sender: row[3],
      subject: row[4],
      message: row[5],
      status: row[6]
    })).reverse();
  }

  return { expenditures: expenditures, inquiries: inquiries };
}

function getGroupNameById(groupId) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const mUsers = ss.getSheetByName('M_Users');
  const data = mUsers.getDataRange().getValues();
  const found = data.find(r => r[1] === groupId);
  return found ? found[2] : groupId;
}

function updateStatus(type, rowIndex, newStatus) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet, colIndex;

  if (type === 'expenditure') {
    sheet = ss.getSheetByName('T_Expenditure');
    colIndex = 5; 
  } else if (type === 'inquiry') {
    sheet = ss.getSheetByName('T_Inquiry');
    colIndex = 7; 
  }

  if (sheet) {
    sheet.getRange(rowIndex, colIndex).setValue(newStatus);
    return { success: true };
  }
  return { success: false };
}

/* ==============================================
 * 3. ユーザー用ロジック & 共通処理
 * ============================================== */
function getUserStatus(email) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const mUsers = ss.getSheetByName('M_Users');
  const mItems = ss.getSheetByName('M_ItemMaster'); 
  const tExp = ss.getSheetByName('T_Expenditure');
  
  const usersData = mUsers.getDataRange().getValues();
  const userRow = usersData.slice(1).find(row => row[0] === email);
  if (!userRow) return null;

  const groupId = userRow[1];

  let allowedItems = [];
  if (mItems) {
    const itemsData = mItems.getDataRange().getValues().slice(1);
    allowedItems = itemsData
      .filter(row => row[0] === groupId)
      .map(row => ({ name: row[1], defaultPrice: row[2] }));
  }

  const groupInfo = {
    email: userRow[0],
    groupId: groupId,
    groupName: userRow[2],
    budgetTotal: userRow[3],
    allowedItems: allowedItems,
    history: [] 
  };

  const expData = tExp.getDataRange().getValues().slice(1);
  let usedAmount = 0;
  let unsettledItem = null;

  expData.forEach(row => {
    if (row[2] === groupId) {
      const status = row[4];
      const amount = Number(row[5]);
      
      if (status === '承認済' || status === '精算完了') usedAmount += amount;
      if (status === '未精算') unsettledItem = { id: row[0], amount: amount, content: row[6] };

      groupInfo.history.push({
        id: row[0],
        date: Utilities.formatDate(new Date(row[1]), 'JST', 'yyyy/MM/dd'),
        type: row[3],
        status: status,
        amount: amount,
        content: row[6].split(' (')[0]
      });
    }
  });

  groupInfo.history.reverse();
  groupInfo.remainingBudget = groupInfo.budgetTotal - usedAmount;
  groupInfo.unsettledItem = unsettledItem;
  return groupInfo;
}

function getAdminEmails() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('M_Admin');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(row => row[1]).filter(email => email && email.includes('@'));
}

/* ==============================================
 * 4. 送信処理 (フォーム & 問い合わせ)
 * ============================================== */
function processForm(formObj) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); 
    const ss = SpreadsheetApp.openById(SS_ID);
    const tExp = ss.getSheetByName('T_Expenditure');
    const userInfo = getUserStatus(Session.getActiveUser().getEmail());
    
    const totalAmount = Number(formObj.totalAmount);
    if (formObj.type !== '精算' && totalAmount > userInfo.remainingBudget) throw new Error("予算超過エラー");

    const now = new Date();
    const newId = 'EXP-' + Utilities.formatDate(now, 'JST', 'yyyyMMdd-HHmmss');
    
    let fileUrl = 'なし';
    if (formObj.fileData && formObj.fileName) {
      const folder = DriveApp.getRootFolder(); 
      const blob = Utilities.newBlob(Utilities.base64Decode(formObj.fileData), formObj.mimeType, formObj.fileName);
      fileUrl = folder.createFile(blob).setName(newId + '_' + formObj.fileName).getUrl();
    }

    const itemsArray = JSON.parse(formObj.itemsJson);
    const simpleContent = itemsArray.map(i => i.item).join(', ');

    tExp.appendRow([
      newId, new Date(), userInfo.groupId, formObj.type,
      (formObj.type === '事前') ? '未精算' : '申請中',
      totalAmount,
      simpleContent + " (詳細あり)", 
      fileUrl, '未'
    ]);

    const mailBodyCommon = `■申請ID: ${newId}\n■団体名: ${userInfo.groupName}\n■タイプ: ${formObj.type}\n■合計: ${totalAmount.toLocaleString()}円\n`;
    GmailApp.sendEmail(userInfo.email, `【申請完了】${newId}`, mailBodyCommon);
    
    const adminEmails = getAdminEmails();
    if (adminEmails.length > 0) {
      GmailApp.sendEmail(adminEmails.join(','), `【新規申請】${userInfo.groupName}`, mailBodyCommon + `\n確認: https://docs.google.com/spreadsheets/d/${SS_ID}/edit`);
    }

    return { success: true, message: "申請完了 ID: " + newId };
  } catch (e) {
    return { success: false, message: "エラー: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function processInquiry(formObj) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: "処理中です。" };

  try {
    const email = Session.getActiveUser().getEmail();
    const userInfo = getUserStatus(email);
    const ss = SpreadsheetApp.openById(SS_ID);
    const tInq = ss.getSheetByName('T_Inquiry');

    const now = new Date();
    const inqId = 'INQ-' + Utilities.formatDate(now, 'JST', 'yyyyMMdd-HHmmss');
    
    if (tInq) {
      tInq.appendRow([inqId, now, userInfo.groupName, email, formObj.subject, formObj.message, '未対応']);
    }

    const bodyContent = `■ID: ${inqId}\n■送信者: ${userInfo.groupName}\n■件名: ${formObj.subject}\n\n${formObj.message}`;
    const adminEmails = getAdminEmails();
    if (adminEmails.length > 0) GmailApp.sendEmail(adminEmails.join(','), `【問い合わせ】${userInfo.groupName}`, bodyContent);
    GmailApp.sendEmail(email, `【受付完了】お問い合わせ`, bodyContent);

    return { success: true, message: "送信しました。" };
  } catch (e) {
    return { success: false, message: "エラー: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}