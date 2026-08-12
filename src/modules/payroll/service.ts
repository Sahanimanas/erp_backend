import { db } from '@common/database/client';
import {
  PAYMENT_MODES,
  PAYMENT_STATUSES,
  CreateSalaryPaymentRequest,
  EffectiveSalary,
  ListSalaryEmployeesQuery,
  ListSalaryPaymentsQuery,
  SaveDepartmentSalaryRequest,
} from './types';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Whole-rupee amount from any request input; negatives and junk become 0. */
function money(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

/** Same as `money` but rejects instead of silently zeroing — used for required amounts. */
function requiredMoney(v: unknown, label: string): number {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) {
    throw new Error(`${label} is required`);
  }
  if (n < 0) throw new Error(`${label} cannot be negative`);
  return Math.trunc(n);
}

type SalaryStructure = { basicSalary: bigint; allowances: bigint; deductions: bigint } | null | undefined;

/**
 * The rate that actually applies to one employee.
 *
 * An employee's own `baseSalary` always wins over the department template —
 * the department row is the fallback for everyone who has no individual rate.
 * Allowances/deductions always come from the department template, since they
 * are a department-level policy.
 */
export function effectiveSalary(
  employee: { baseSalary?: bigint | null },
  structure: SalaryStructure,
): EffectiveSalary {
  const own = employee.baseSalary != null ? Number(employee.baseSalary) : null;
  const basicSalary = own ?? (structure ? Number(structure.basicSalary) : 0);
  const allowances = structure ? Number(structure.allowances) : 0;
  const deductions = structure ? Number(structure.deductions) : 0;

  return {
    basicSalary,
    allowances,
    deductions,
    monthlySalary: Math.max(0, basicSalary + allowances - deductions),
    source: own != null ? 'EMPLOYEE' : structure ? 'DEPARTMENT' : 'NONE',
  };
}

/** Normalise a requested month list to a sorted, deduped set of 1–12 integers. */
function normalizeMonths(raw: Array<number | string> | undefined): number[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Select at least one month');
  }
  const months = [...new Set(raw.map((m) => Math.trunc(Number(m))))];
  if (months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
    throw new Error('Months must be between 1 and 12');
  }
  return months.sort((a, b) => a - b);
}

function normalizeYear(raw: number | string | undefined): number {
  const year = Math.trunc(Number(raw));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Year must be between 2000 and 2100');
  }
  return year;
}

export class PayrollService {
  // ── Department salary structure ────────────────────────────────────────

  /**
   * Every (non-deleted) department with its salary template, if any, plus the
   * headcount the template covers. Departments without a template come back
   * with `salary: null` so the UI can show them as "not set".
   */
  async listDepartmentSalaries(schoolId: string) {
    const departments = await db.department.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        salary: true,
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });

    return departments.map((d) => {
      const s = d.salary;
      const basicSalary = s ? Number(s.basicSalary) : 0;
      const allowances = s ? Number(s.allowances) : 0;
      const deductions = s ? Number(s.deductions) : 0;
      return {
        departmentId: d.id,
        departmentName: d.name,
        employeeCount: d._count.employees,
        configured: !!s,
        basicSalary,
        allowances,
        deductions,
        monthlySalary: Math.max(0, basicSalary + allowances - deductions),
        remarks: s?.remarks ?? null,
        updatedAt: s?.updatedAt ?? null,
      };
    });
  }

  /** Create or replace one department's salary template. */
  async saveDepartmentSalary(schoolId: string, data: SaveDepartmentSalaryRequest) {
    const departmentId = data.departmentId?.trim();
    if (!departmentId) throw new Error('Department is required');

    // Tenant check before the write — Prisma upsert alone would be unscoped.
    const department = await db.department.findFirst({
      where: { id: departmentId, schoolId, deletedAt: null },
    });
    if (!department) throw new Error('Department not found');

    const basicSalary = requiredMoney(data.basicSalary, 'Basic salary');
    const allowances = money(data.allowances);
    const deductions = money(data.deductions);
    if (deductions > basicSalary + allowances) {
      throw new Error('Deductions cannot exceed basic salary plus allowances');
    }

    const values = {
      basicSalary: BigInt(basicSalary),
      allowances: BigInt(allowances),
      deductions: BigInt(deductions),
      remarks: data.remarks?.trim() || null,
    };

    return db.departmentSalary.upsert({
      where: { departmentId },
      create: { schoolId, departmentId, ...values },
      update: values,
    });
  }

  /** Remove a department's template — its employees fall back to "not set". */
  async deleteDepartmentSalary(schoolId: string, departmentId: string) {
    const existing = await db.departmentSalary.findFirst({
      where: { departmentId, schoolId },
    });
    if (!existing) throw new Error('Department salary not found');

    await db.departmentSalary.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }

  // ── Employees with their pay state ─────────────────────────────────────

  /**
   * The salary roster: every employee with department, designation, the rate
   * that applies to them and which months of `year` are already paid/pending.
   */
  async listSalaryEmployees(schoolId: string, query: ListSalaryEmployeesQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 10));
    const year = query.year ? normalizeYear(query.year) : new Date().getFullYear();

    const where: any = { schoolId, deletedAt: null };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.designationId) where.designationId = query.designationId;
    if (query.search) {
      where.OR = [
        { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true, isActive: true } },
          department: { select: { id: true, name: true, salary: true } },
          designation: { select: { id: true, name: true } },
        },
        orderBy: { employeeCode: 'asc' },
      }),
      db.employee.count({ where }),
    ]);

    // One query for the whole page's pay state, rather than one per employee.
    const payments = employees.length
      ? await db.salaryPayment.findMany({
          where: {
            schoolId,
            year,
            deletedAt: null,
            employeeId: { in: employees.map((e) => e.id) },
          },
          select: { employeeId: true, months: true, status: true, totalAmount: true },
        })
      : [];

    const byEmployee = new Map<string, { paidMonths: number[]; pendingMonths: number[]; paidAmount: number }>();
    for (const p of payments) {
      const entry = byEmployee.get(p.employeeId) ?? { paidMonths: [], pendingMonths: [], paidAmount: 0 };
      if (p.status === 'PAID') {
        entry.paidMonths.push(...p.months);
        entry.paidAmount += Number(p.totalAmount);
      } else {
        entry.pendingMonths.push(...p.months);
      }
      byEmployee.set(p.employeeId, entry);
    }

    const rows = employees.map((e) => {
      const salary = effectiveSalary(e, e.department?.salary);
      const state = byEmployee.get(e.id) ?? { paidMonths: [], pendingMonths: [], paidAmount: 0 };
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        name: `${e.user.firstName} ${e.user.lastName}`.trim(),
        email: e.user.email,
        phone: e.user.phone,
        isActive: e.user.isActive,
        photo: e.photo,
        bankAccount: e.bankAccount,
        ifscCode: e.ifscCode,
        dateOfJoining: e.dateOfJoining,
        departmentId: e.departmentId,
        departmentName: e.department?.name ?? null,
        designationId: e.designationId,
        designationName: e.designation?.name ?? null,
        ...salary,
        year,
        paidMonths: [...new Set(state.paidMonths)].sort((a, b) => a - b),
        pendingMonths: [...new Set(state.pendingMonths)].sort((a, b) => a - b),
        paidAmount: state.paidAmount,
      };
    });

    return { rows, total, page, limit };
  }

  // ── Salary payments ────────────────────────────────────────────────────

  /**
   * Record a salary payment for one employee across one or more months.
   *
   * The rate is always recomputed server-side from the employee/department
   * setup — the client never supplies an amount — and months already covered
   * by another payment in the same year are rejected.
   */
  async createSalaryPayment(schoolId: string, userId: string | undefined, data: CreateSalaryPaymentRequest) {
    const employeeId = data.employeeId?.trim();
    if (!employeeId) throw new Error('Employee is required');

    const months = normalizeMonths(data.months);
    const year = normalizeYear(data.year);

    const paymentMode = (data.paymentMode || '').trim().toUpperCase();
    if (!PAYMENT_MODES.includes(paymentMode as any)) {
      throw new Error(`Payment mode must be one of: ${PAYMENT_MODES.join(', ')}`);
    }

    const status = (data.status || 'PAID').trim().toUpperCase();
    if (!PAYMENT_STATUSES.includes(status as any)) {
      throw new Error(`Status must be one of: ${PAYMENT_STATUSES.join(', ')}`);
    }

    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId, deletedAt: null },
      include: { department: { select: { salary: true } } },
    });
    if (!employee) throw new Error('Employee not found');

    const salary = effectiveSalary(employee, employee.department?.salary);
    if (salary.monthlySalary <= 0) {
      throw new Error(
        'No salary is configured for this employee. Set a department salary or an employee base salary first.',
      );
    }

    // A month may only be covered once per employee per year — paid or saved.
    const existing = await db.salaryPayment.findMany({
      where: { schoolId, employeeId, year, deletedAt: null },
      select: { months: true },
    });
    const taken = new Set(existing.flatMap((p) => p.months));
    const clash = months.filter((m) => taken.has(m));
    if (clash.length) {
      throw new Error(
        `Salary for ${clash.map((m) => MONTH_NAMES[m - 1]).join(', ')} ${year} is already recorded for this employee`,
      );
    }

    const total = salary.monthlySalary * months.length;

    return db.salaryPayment.create({
      data: {
        schoolId,
        employeeId,
        year,
        months,
        monthCount: months.length,
        monthlySalary: BigInt(salary.basicSalary),
        allowances: BigInt(salary.allowances),
        deductions: BigInt(salary.deductions),
        totalAmount: BigInt(total),
        paymentMode,
        status,
        paidDate: status === 'PAID' ? new Date() : null,
        remarks: data.remarks?.trim() || null,
        createdBy: userId ?? null,
      },
      include: {
        employee: {
          select: {
            employeeCode: true,
            user: { select: { firstName: true, lastName: true } },
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
    });
  }

  /** Payment history, newest first. */
  async listSalaryPayments(schoolId: string, query: ListSalaryPaymentsQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 10));

    const where: any = { schoolId, deletedAt: null };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.year) where.year = normalizeYear(query.year);
    if (query.month) where.months = { has: Math.trunc(Number(query.month)) };
    if (query.status) where.status = String(query.status).toUpperCase();
    if (query.departmentId) where.employee = { departmentId: query.departmentId };
    if (query.search) {
      where.employee = {
        ...(where.employee || {}),
        OR: [
          { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [payments, total] = await Promise.all([
      db.salaryPayment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              user: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
              designation: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.salaryPayment.count({ where }),
    ]);

    const rows = payments.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      employeeCode: p.employee.employeeCode,
      employeeName: `${p.employee.user.firstName} ${p.employee.user.lastName}`.trim(),
      departmentName: p.employee.department?.name ?? null,
      designationName: p.employee.designation?.name ?? null,
      year: p.year,
      months: p.months,
      monthNames: p.months.map((m) => MONTH_NAMES[m - 1]).filter(Boolean),
      monthCount: p.monthCount,
      monthlySalary: Number(p.monthlySalary),
      allowances: Number(p.allowances),
      deductions: Number(p.deductions),
      totalAmount: Number(p.totalAmount),
      paymentMode: p.paymentMode,
      status: p.status,
      paidDate: p.paidDate,
      remarks: p.remarks,
      createdAt: p.createdAt,
    }));

    return { rows, total, page, limit };
  }

  /** Disburse a payment that was saved as PENDING. */
  async markSalaryPaid(schoolId: string, id: string, paymentMode?: string) {
    const payment = await db.salaryPayment.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!payment) throw new Error('Salary payment not found');
    if (payment.status === 'PAID') throw new Error('This salary is already paid');

    let mode = payment.paymentMode;
    if (paymentMode) {
      const next = paymentMode.trim().toUpperCase();
      if (!PAYMENT_MODES.includes(next as any)) {
        throw new Error(`Payment mode must be one of: ${PAYMENT_MODES.join(', ')}`);
      }
      mode = next;
    }

    return db.salaryPayment.update({
      where: { id },
      data: { status: 'PAID', paidDate: new Date(), paymentMode: mode },
    });
  }

  /** Soft-delete a payment, freeing its months to be paid again. */
  async deleteSalaryPayment(schoolId: string, id: string) {
    const payment = await db.salaryPayment.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!payment) throw new Error('Salary payment not found');

    await db.salaryPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  /** Header figures for the salary dashboard. */
  async getSalarySummary(schoolId: string, rawYear?: number) {
    const year = rawYear ? normalizeYear(rawYear) : new Date().getFullYear();

    const [employees, payments, departmentsWithSalary, departmentCount] = await Promise.all([
      db.employee.findMany({
        where: { schoolId, deletedAt: null },
        select: { baseSalary: true, department: { select: { salary: true } } },
      }),
      db.salaryPayment.findMany({
        where: { schoolId, year, deletedAt: null },
        select: { status: true, totalAmount: true },
      }),
      db.departmentSalary.count({ where: { schoolId } }),
      db.department.count({ where: { schoolId, deletedAt: null } }),
    ]);

    const monthlyPayroll = employees.reduce(
      (sum, e) => sum + effectiveSalary(e, e.department?.salary).monthlySalary,
      0,
    );
    const unconfigured = employees.filter(
      (e) => effectiveSalary(e, e.department?.salary).monthlySalary <= 0,
    ).length;

    return {
      year,
      employeeCount: employees.length,
      monthlyPayroll,
      unconfiguredEmployees: unconfigured,
      departmentCount,
      departmentsWithSalary,
      totalPaid: payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.totalAmount), 0),
      totalPending: payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.totalAmount), 0),
      paidCount: payments.filter((p) => p.status === 'PAID').length,
      pendingCount: payments.filter((p) => p.status === 'PENDING').length,
    };
  }
}

export default new PayrollService();
