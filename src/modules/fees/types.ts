export interface CreateFeeGroupRequest {
  name: string;
  description?: string;
}

export interface CreateFeeTypeRequest {
  groupId: string;
  name: string;
  amount: number;
  isOptional?: boolean;
}

export interface CreateFeeStructureRequest {
  sectionId: string;
  groupId: string;
  dueDate: Date;
  fine?: number;
}

export interface CollectFeeRequest {
  studentId: string;
  feeId: string;
  amount: number;
  remarks?: string;
}

export interface FeeReceiptRequest {
  feeCollectionId: string;
}

export interface FeeReminderRequest {
  studentIds: string[];
  message: string;
}
