import {
  APPLICATION_TYPE_OPTIONS,
  PDF_MIME_TYPE,
  RECEIPT_LABEL,
  REIMBURSEMENT_REQUEST_TYPE,
  SETTLEMENT_TYPE,
  STANDARD_REQUEST_TYPE,
  type ApplicationRequestType,
  type RequestAvailabilityMap,
  type UnsettledItem,
  type UserFormBootstrap,
  type UserFormTypeOption,
} from './accounting-domain.ts';

export type UserFormMode = 'application' | 'settlement';

export interface UserFormContext {
  requestAvailability: RequestAvailabilityMap;
  unsettledItems: UnsettledItem[]; // ← unsettledItem から unsettledItems に変更
}

export interface UserFormState {
  mode: UserFormMode;
  title: string;
  requestType: ApplicationRequestType | typeof SETTLEMENT_TYPE | null;
  showTypeSelector: boolean;
  applicationTypes: UserFormTypeOption[];
  showFileUpload: boolean;
  fileRequired: boolean;
  fileLabel: string;
  fileAccept: string;
  settlementInfoVisible: boolean;
  budgetInfoVisible: boolean;
  submitLabel: string;
}

const TYPE_LABELS: Record<ApplicationRequestType, string> = {
  [STANDARD_REQUEST_TYPE]: STANDARD_REQUEST_TYPE,
  [REIMBURSEMENT_REQUEST_TYPE]: REIMBURSEMENT_REQUEST_TYPE,
};

export class UserFormViewModelFactory {
  static buildBootstrap(context: UserFormContext): UserFormBootstrap {
    return {
      receiptLabel: RECEIPT_LABEL,
      fileAccept: PDF_MIME_TYPE,
      applicationTypes: this.buildApplicationTypes(context.requestAvailability),
      requestAvailability: context.requestAvailability,
    };
  }

  static buildState(
    mode: UserFormMode,
    context: UserFormContext,
    selectedType?: ApplicationRequestType | null,
  ): UserFormState {
    const applicationTypes = this.buildApplicationTypes(context.requestAvailability);

    if (mode === 'settlement') {
      return {
        mode,
        title: '通常精算手続き',
        requestType: SETTLEMENT_TYPE,
        showTypeSelector: false,
        applicationTypes,
        showFileUpload: true,
        fileRequired: true,
        fileLabel: RECEIPT_LABEL,
        fileAccept: PDF_MIME_TYPE,
        settlementInfoVisible: true,
        budgetInfoVisible: false,
        submitLabel: '通常精算する',
      };
    }

    const resolvedType = this.resolveApplicationType(applicationTypes, selectedType);
    const requiresReceipt = resolvedType === REIMBURSEMENT_REQUEST_TYPE;

    return {
      mode,
      title: '支出申請',
      requestType: resolvedType,
      showTypeSelector: true,
      applicationTypes,
      showFileUpload: requiresReceipt,
      fileRequired: requiresReceipt,
      fileLabel: RECEIPT_LABEL,
      fileAccept: PDF_MIME_TYPE,
      settlementInfoVisible: false,
      budgetInfoVisible: true,
      submitLabel: '申請する',
    };
  }

  static hasAvailableApplicationType(context: UserFormContext): boolean {
    return this.buildApplicationTypes(context.requestAvailability).some(
      (typeOption) => typeOption.allowed,
    );
  }

  private static buildApplicationTypes(
    availabilityMap: RequestAvailabilityMap,
  ): UserFormTypeOption[] {
    return APPLICATION_TYPE_OPTIONS.map((value) => ({
      value,
      label: TYPE_LABELS[value],
      allowed: availabilityMap[value].allowed,
      reason: availabilityMap[value].reason,
    }));
  }

  private static resolveApplicationType(
    applicationTypes: UserFormTypeOption[],
    selectedType?: ApplicationRequestType | null,
  ): ApplicationRequestType | null {
    const selectedOption = applicationTypes.find(
      (option) => option.value === selectedType && option.allowed,
    );
    if (selectedOption) {
      return selectedOption.value;
    }

    return applicationTypes.find((option) => option.allowed)?.value ?? null;
  }
}
