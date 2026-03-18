import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        // GASの主要なグローバル変数を定義
        SpreadsheetApp: 'readonly',
        GmailApp: 'readonly',
        DriveApp: 'readonly',
        Utilities: 'readonly',
        Browser: 'readonly',
        Logger: 'readonly',
        UrlFetchApp: 'readonly',
        HtmlService: 'readonly',
        ContentService: 'readonly',
      },
    },
  rules: {
      // 特定のGAS関数名を警告から除外する設定
      '@typescript-eslint/no-unused-vars': ['warn', { 
        'varsIgnorePattern': '^(doGet|doPost|include|processForm|processInquiry|getAdminDashboardData|updateStatus)$' 
      }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
