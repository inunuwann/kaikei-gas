# 技術マニュアル

## 1. このマニュアルの目的

このマニュアルは、会計システムを保守・改修する担当者向けの技術資料です。  
GAS、HTML Service、TypeScript、ビルド、CI、テスト、ログの構成をまとめています。

目的は次の 3 つです。

- 新しい担当者が短時間で全体像を理解できるようにする
- 改修時にどのファイルを触ればよいか判断しやすくする
- デプロイ、テスト、障害調査を再現性高く行えるようにする

---

## 2. システム概要

このシステムは Google Apps Script（GAS）で動く会計 Web アプリです。  
ユーザー向けの支出申請画面と、管理者向けの会計管理ダッシュボードを同じ GAS プロジェクト内で提供しています。

主な特徴:

- Web アプリとして `doGet` で画面を返す
- サーバー側は TypeScript を esbuild で bundle して GAS 用 `code.js` を生成する
- クライアント側 UI は HTML Service のテンプレートとブラウザ JavaScript で構成する
- スプレッドシートをデータベース代わりに使う
- `CacheService` とクライアント側フィルタで管理画面を軽量化している
- `mise` で Node と反復コマンドを管理している

---

## 3. 技術スタック

### 3.1 サーバー側

- Google Apps Script
- TypeScript
- V8 runtime

### 3.2 クライアント側

- HTML Service
- Vanilla JavaScript
- CSS

### 3.3 ビルド / 開発ツール

- `esbuild`
- `esbuild-gas-plugin`
- `mise`
- `clasp`
- Node test runner (`node --experimental-strip-types --test`)

### 3.4 CI / デプロイ

- GitHub Actions
- `jdx/mise-action@v3`
- `clasp push --force`

---

## 4. ディレクトリ構成

### 4.1 `src`

アプリ本体のソースです。

- `code.ts`
  - GAS のエントリポイント
  - 画面描画、API、メール送信、保存処理
- `accounting-domain.ts`
  - 型、定数、純粋ユーティリティ
- `expenditure-policy.ts`
  - 会計ルール、申請制御、添付制御
- `accounting-spreadsheet-repository.ts`
  - スプレッドシート I/O
  - CacheService を使ったマスタキャッシュ
- `admin-dashboard-service.ts`
  - 管理画面の検索 / 並び替えロジック
- `user-form-view-model.ts`
  - ユーザー画面フォーム状態の組み立て
- `debug-logger.ts`
  - GAS サーバー用ログヘルパー
- `admin.html`
  - 管理画面テンプレート
- `admin_script.html`
  - 管理画面のブラウザスクリプト
- `index.html`
  - ユーザー画面テンプレート
- `javascript.html`
  - ユーザー画面のブラウザスクリプト
- `client_debug.html`
  - ブラウザ共通のデバッグロガー
- `css.html`
  - 共通スタイル
- `select_role.html`
  - 権限選択画面
- `appsscript.json`
  - GAS manifest

### 4.2 `test`

Node テストです。

- ドメイン / ポリシー / 検索ロジックの単体テスト
- HTML テンプレートの構造確認
- build 後の GAS エントリポイント確認
- 予算案 PDF を構造化した fixture テスト

### 4.3 `docs`

- `docs/usage`
  - 運用マニュアル
- `docs/ailog`
  - 作業記録
- `docs/test-data`
  - 2024 年度予算案 PDF

---

## 5. 画面構成

## 5.1 権限選択画面

`src/select_role.html` です。  
管理者と利用者の両方の権限を持つユーザーだけに表示されます。

### 5.2 ユーザー画面

`src/index.html` と `src/javascript.html` が担当します。

主な画面:

- ダッシュボード
- 支出申請フォーム
- 通常精算フォーム
- お問い合わせフォーム

### 5.3 管理者画面

`src/admin.html` と `src/admin_script.html` が担当します。

主な画面:

- 支出・精算管理タブ
- お問い合わせ管理タブ
- 検索フィルタ
- ステータス更新 UI

---

## 6. リクエストの流れ

### 6.1 `doGet`

入口は `src/code.ts` の `doGet` です。

処理概要:

1. ログイン中のメールアドレスを取得
2. `M_Admin` / `M_Users` を参照して権限を判定
3. 条件に応じて以下を返す
   - 管理者画面
   - ユーザー画面
   - 権限選択画面
   - アクセス不可メッセージ

### 6.2 ユーザー画面の描画

ユーザー画面では `buildUserStatusViewData()` が中核です。

中で行うこと:

- 団体の支出履歴読込
- 残高計算
- 未精算通常請求の取得
- 新規申請可否の計算
- 申請フォーム bootstrap データ生成

### 6.3 管理画面の描画

管理画面では `getAdminDashboardBootstrap()` を使って支出一覧と検索候補を初回描画時に埋め込みます。  
問い合わせは `getInquiryDashboardData()` で遅延読込します。

これにより、初回表示は全件一覧をすぐ出しつつ、不要なシート読込を減らしています。

---

## 7. 会計ルールの中心

会計ルールの中心は `src/expenditure-policy.ts` です。

### 7.1 会計タイプ

`src/accounting-domain.ts` で次の 3 種類に統一されています。

- `通常請求`
- `事後請求`
- `通常精算`

過去データの互換のため、旧名称も正規化しています。

- `事前` → `通常請求`
- `事後` → `事後請求`
- `精算` → `通常精算`

### 7.2 添付ルール

- `通常請求`
  - 添付不要
- `事後請求`
  - 領収書 PDF 必須
- `通常精算`
  - 領収書 PDF 必須

### 7.3 重複申請制御

- `通常請求`
  - 同一団体に `申請中` / `承認済` / `未精算` の通常請求があると新規不可
- `事後請求`
  - 同一団体に `申請中` の事後請求があると新規不可

### 7.4 精算開始条件

- 同一団体に `未精算` の `通常請求` があるときだけ `通常精算` を開始可能

### 7.5 残高計算

利用済み予算として加算するのは次のステータスです。

- `承認済`
- `精算完了`

---

## 8. スプレッドシート構成

### 8.1 使用シート

コード上で参照している主なシートは次のとおりです。

- `M_Admin`
- `M_Users`
- `M_ItemMaster`
- `T_Expenditure`
- `T_Inquiry`

### 8.2 `M_Admin`

管理者メールアドレス一覧を持ちます。  
`accounting-spreadsheet-repository.ts` の `extractAdminEmails()` で読まれます。

### 8.3 `M_Users`

利用者マスタです。  
想定列:

1. メールアドレス
2. 団体 ID
3. 団体名
4. 予算額

### 8.4 `M_ItemMaster`

品目マスタです。  
想定列:

1. 団体 ID
2. 品目名
3. 既定単価

### 8.5 `T_Expenditure`

支出 / 請求 / 精算レコードです。  
`processForm()` では次の順序で append しています。

1. 申請 ID
2. 登録日時
3. 団体 ID
4. タイプ
5. ステータス
6. 合計金額
7. 内容
8. ファイル URL
9. 精算フラグ相当の列

### 8.6 `T_Inquiry`

問い合わせレコードです。  
`processInquiry()` で追加されます。

---

## 9. スプレッドシートアクセスの最適化

重い処理を避けるため、`src/accounting-spreadsheet-repository.ts` では以下を実施しています。

- `getValue()` / `setValue()` の多重ループを避ける
- `getLastRow()` と `getRange(...).getValues()` で一括読込する
- `M_Admin` / `M_Users` / `M_ItemMaster` は `CacheService` に 5 分キャッシュする

メモリキャッシュも併用しているため、同一実行中の再読込も減らしています。

---

## 10. 管理画面軽量化の仕組み

`src/admin_script.html` の `AdminDashboardApp` が中心です。

軽量化ポイント:

- 初回表示時に支出一覧をテンプレートへ埋め込む
- 団体名 / タイプ候補を初回表示で持つ
- 問い合わせはタブを開いた時だけ取得する
- 検索 / 並び替えはブラウザ内のデータで実行する
- ステータス更新後も再取得ではなくローカル状態を更新する

---

## 11. ユーザー画面の構造

`src/javascript.html` には主に 2 クラスあります。

### 11.1 `ItemsTableController`

責務:

- 明細行の追加 / 削除
- 小計 / 合計の自動計算
- 品目重複防止
- 申請タイプに応じた入力 UI 切替

### 11.2 `UserDashboardApp`

責務:

- ダッシュボード / フォーム / 問い合わせ画面切替
- 会計タイプ選択
- 通常精算開始
- PDF 添付チェック
- フォーム送信
- 問い合わせ送信

---

## 12. 管理画面の検索仕様

検索条件は `src/admin-dashboard-service.ts` で正規化されます。

条件:

- `idQuery`
- `dateFrom`
- `dateTo`
- `groups`
- `types`
- `amountMode`
- `amountValue`
- `amountMin`
- `amountMax`
- `contentQuery`
- `sortBy`
- `sortOrder`

並び替え:

- `date`
- `id`

並び順:

- `asc`
- `desc`

---

## 13. 日付検索 UI の仕様

管理画面の日付検索は 1 つのカレンダーで開始日と終了日を扱います。

実装:

- HTML 側
  - `filterDateRangeTrigger`
  - `filterDateRangePopover`
  - `filterDateFrom`
  - `filterDateTo`
- JavaScript 側
  - `handleDateRangeSelection()`
  - `setDateRange()`
  - `clearDateRange()`

挙動:

- 1回目のクリックで単日選択
- 2回目のクリックで期間確定
- `クリア` で解除

---

## 14. デバッグログの仕組み

### 14.1 サーバー側

`src/debug-logger.ts` を使って GAS ログを出しています。  
計測できる情報:

- 処理名
- 開始 / 終了
- 所要時間
- エラー内容
- 補足コンテキスト

### 14.2 クライアント側

`src/client_debug.html` を読み込んでいます。  
ブラウザ Console には `[KaikeiDebug]` プレフィックスのログが出ます。

対象:

- 画面初期化
- タブ切替
- 検索
- 明細更新
- ファイル選択
- 送信
- ステータス変更

---

## 15. ビルドの仕組み

`build.js` がビルド入口です。

処理:

1. `src/code.ts` を bundle して `dist/code.js` を生成
2. `src/*.html` を `dist/` にコピー
3. `src/appsscript.json` を `dist/` にコピー

重要ポイント:

- GAS が解釈できるよう `es2019` ターゲットで bundle している
- GAS の公開関数は `code.ts` で `globalThis` へ明示公開している

---

## 16. `mise` による環境管理

`mise.toml` で以下を管理しています。

- Node バージョン
- install
- ci-install
- build
- test
- push
- deploy
- watch

基本コマンド:

```sh
mise run install
mise run test
mise run build
mise run push
mise run deploy
```

`package.json` の npm scripts は `mise run ...` のラッパーになっています。

---

## 17. GitHub Actions / デプロイ

デプロイ workflow は `.github/workflows/deploy.yml` です。

流れ:

1. checkout
2. `jdx/mise-action@v3` でツール準備
3. `mise run ci-install`
4. `mise run build`
5. `.clasp.json` 生成
6. `~/.clasprc.json` を Secret から生成
7. `mise run deploy`

必要な Secret:

- `CLASPRC_JSON`

---

## 18. GAS manifest

`src/appsscript.json` の現在値は以下の性質を持ちます。

- `timeZone = Asia/Tokyo`
- `runtimeVersion = V8`
- `exceptionLogging = STACKDRIVER`
- `webapp.executeAs = USER_DEPLOYING`
- `webapp.access = MYSELF`

注意:

`access = MYSELF` はアクセス範囲に影響するため、運用形態に合わせて見直しが必要な場合があります。

---

## 19. テスト構成

### 19.1 業務ロジック

- `test/expenditure-policy.test.ts`
- `test/admin-dashboard-service.test.ts`
- `test/user-form-view-model.test.ts`
- `test/accounting-domain.test.ts`
- `test/accounting-spreadsheet-repository.test.ts`

### 19.2 テンプレート / UI 構造

- `test/admin-bootstrap-template.test.ts`
- `test/admin-date-range-picker.test.ts`
- `test/admin-script-architecture.test.ts`
- `test/template-debug-include.test.ts`

### 19.3 build / GAS エントリポイント

- `test/gas-entrypoints.test.ts`

### 19.4 実データ fixture

- `test/budget-proposal-fixtures.ts`
- `test/budget-proposal-fixtures.test.ts`

`docs/test-data` の予算案 PDF 23件をもとに、全団体分のテストデータを構造化しています。

---

## 20. テスト実行方法

```sh
node --experimental-strip-types --test test/*.test.ts
```

または

```sh
mise run test
```

---

## 21. よくある改修ポイント

### 21.1 会計タイプを追加 / 変更したい

最初に確認するファイル:

- `src/accounting-domain.ts`
- `src/expenditure-policy.ts`
- `src/user-form-view-model.ts`
- `src/javascript.html`
- `src/admin-dashboard-service.ts`
- 関連テスト

### 21.2 スプレッドシート列を変更したい

最初に確認するファイル:

- `src/accounting-spreadsheet-repository.ts`
- `src/code.ts`
- 関連テスト

### 21.3 管理画面の検索条件を増やしたい

最初に確認するファイル:

- `src/admin.html`
- `src/admin_script.html`
- `src/admin-dashboard-service.ts`
- `test/admin-dashboard-service.test.ts`

### 21.4 フロント挙動を追いたい

ユーザー画面:

- `src/index.html`
- `src/javascript.html`

管理画面:

- `src/admin.html`
- `src/admin_script.html`

---

## 22. 障害調査の基本手順

1. ブラウザ Console を開く
2. `[KaikeiDebug]` ログを確認する
3. GAS 実行ログを見る
4. `docs/ailog/2026-03-18-codex.md` で過去の改修意図を確認する
5. 関連テストを先に実行する
6. 必要に応じて fixture を使って再現条件を作る

---

## 23. 変更時の基本ルール

- UI 制御だけでなくサーバー側の業務ルールも合わせて変更する
- スプレッドシート列順を変える場合は repository と appendRow を両方直す
- 変更後は必ず `test` と `build` を確認する
- GAS 公開関数を消さないよう `globalThis` 公開を維持する
- 管理画面の重い処理はクライアント側フィルタとキャッシュを優先する

---

## 24. まとめ

このシステムの理解は次の順番で追うと早いです。

1. `src/code.ts`
2. `src/accounting-spreadsheet-repository.ts`
3. `src/expenditure-policy.ts`
4. `src/index.html` / `src/javascript.html`
5. `src/admin.html` / `src/admin_script.html`
6. `test` 一式

運用寄りの情報は `admin-manual.md` と `user-manual.md`、改修履歴は `docs/ailog/2026-03-18-codex.md` を参照してください。
