/** Accepted salary payment modes. */
export const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'ONLINE'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** A payment is either disbursed now (PAID) or parked for later (PENDING). */
export const PAYMENT_STATUSES = ['PAID', 'PENDING'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface SaveDepartmentSalaryRequest {
  departmentId: string;
  basicSalary: number | string;
  allowances?: number | string;
  deductions?: number | string;
  remarks?: string;
}

export interface CreateSalaryPaymentRequest {
  employeeId: string;
  year: number | string;
  /** Month numbers 1–12. */
  months: Array<number | string>;
  paymentMode: string;
  /** PAID = pay now, PENDING = save for later. Defaults to PAID. */
  status?: string;
  remarks?: string;
}

export interface ListSalaryEmployeesQuery {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  designationId?: string;
  year?: number;
}

export interface ListSalaryPaymentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  employeeId?: string;
  departmentId?: string;
  year?: number;
  month?: number;
  status?: string;
}

/** The salary figures actually applied to an employee, and where they came from. */
export interface EffectiveSalary {
  basicSalary: number;
  allowances: number;
  deductions: number;
  /** basic + allowances − deductions, floored at 0. */
  monthlySalary: number;
  /** EMPLOYEE = own baseSalary, DEPARTMENT = department template, NONE = unset. */
  source: 'EMPLOYEE' | 'DEPARTMENT' | 'NONE';
}
