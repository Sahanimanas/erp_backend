import { db } from '@common/database/client';
import { hashPassword, generateRandomPassword } from '@common/utils/crypto';
import { CreateEmployeeRequest, UpdateEmployeeRequest, CreateDepartmentRequest, CreateDesignationRequest, ApplyLeaveRequest } from './types';

export interface LeaveTypeInput {
  name?: string;
  shortName?: string;
  maxDays?: number;
  paid?: boolean;
  enabled?: boolean;
  validity?: 'MONTHLY' | 'YEARLY' | 'SESSION' | 'ON_OCCASION';
}

/** Shape a LeaveType create/restore payload from raw request input. */
function normalizeLeaveType(data: LeaveTypeInput, name: string) {
  return {
    name,
    shortName: (data.shortName || name.slice(0, 3)).trim().toUpperCase(),
    maxDays: Math.max(0, Number(data.maxDays) || 0),
    paid: data.paid === undefined ? true : !!data.paid,
    enabled: data.enabled === undefined ? true : !!data.enabled,
    validity: (data.validity as any) || 'YEARLY',
  };
}

/** Midnight-UTC copy of a date, so day maths never drifts on DST/timezones. */
function atUtcMidnight(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Days in [start, end] inclusive, minus Sundays and any date on the school's
 * holiday calendar — the "Actual (Exclude Holidays)" figure.
 */
async function countActualDays(schoolId: string, start: Date, end: Date): Promise<number> {
  const holidays = await db.holiday.findMany({
    where: { schoolId, date: { gte: atUtcMidnight(start), lte: atUtcMidnight(end) } },
    select: { date: true },
  });
  const off = new Set(holidays.map((h) => atUtcMidnight(h.date).toISOString().slice(0, 10)));

  let count = 0;
  for (let d = atUtcMidnight(start); d <= atUtcMidnight(end); d = new Date(d.getTime() + 86400000)) {
    if (d.getUTCDay() === 0) continue;                       // Sunday = weekly off
    if (off.has(d.toISOString().slice(0, 10))) continue;     // declared holiday
    count++;
  }
  return count;
}

export class EmployeeService {
  /**
   * Create employee
   */
  async createEmployee(schoolId: string, data: CreateEmployeeRequest) {
    const { email } = data;

    const existingUser = await db.user.findUnique({
      where: {
        email_schoolId: {
          email,
          schoolId,
        },
      },
    });

    if (existingUser) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await hashPassword(data.password);
    const employeeCode = data.employeeCode?.trim() || `EMP-${Date.now()}`;

    // Map an optional staff role to a valid UserRole; default to TEACHER.
    const VALID_ROLES = ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT'];
    const role = data.role && VALID_ROLES.includes(data.role) ? data.role : 'TEACHER';

    // Coerce optional date-only strings (from <input type="date">) into Dates.
    const dob = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    const doj = data.dateOfJoining ? new Date(data.dateOfJoining) : new Date();

    const experiences = (data.experiences || []).filter((e) => e && e.employer?.trim());

    // Create user + employee (+ experiences) atomically.
    const employee = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId,
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          phone: data.phone,
          password: hashedPassword,
          role: role as any,
        },
      });

      return tx.employee.create({
        data: {
          schoolId,
          userId: user.id,
          employeeCode,
          departmentId: data.departmentId || null,
          designationId: data.designationId || null,
          reportingToId: data.reportingToId || null,
          dateOfBirth: dob && !isNaN(dob.getTime()) ? dob : null,
          gender: data.gender,
          bloodGroup: data.bloodGroup,
          city: data.city,
          address: data.address,
          permanentAddress: data.permanentAddress,
          fatherName: data.fatherName,
          husbandName: data.husbandName,
          qualification: data.qualification,
          rfidNumber: data.rfidNumber,
          aadharNumber: data.aadharNumber,
          panNumber: data.panNumber,
          dateOfJoining: !isNaN(doj.getTime()) ? doj : new Date(),
          bankAccount: data.bankAccount,
          ifscCode: data.ifscCode,
          baseSalary: data.baseSalary ? BigInt(data.baseSalary) : null,
          photo: data.photo,
          ...(experiences.length && {
            experiences: {
              create: experiences.map((e) => ({
                schoolId,
                employer: e.employer,
                role: e.role,
                totalExperience: e.totalExperience,
              })),
            },
          }),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          department: true,
          designation: true,
          experiences: true,
        },
      });
    });

    return employee;
  }

  /**
   * Update employee
   */
  async updateEmployee(schoolId: string, employeeId: string, data: UpdateEmployeeRequest) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const raw = data as any;

    // The edit form posts every field it renders, blanks included. Treat a blank
    // string as "clear this" for nullable columns and "leave alone" for required
    // ones — never as a literal "" (Prisma rejects it for dates/BigInt).
    const blank = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    const toDate = (v: any, field: string) => {
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new Error(`Invalid ${field}`);
      return d;
    };

    const updateData: any = {};

    // Only Employee's own scalar columns may go into employee.update — name,
    // email and phone live on the linked User and are handled below.
    const NULLABLE_FIELDS = [
      'departmentId', 'designationId', 'reportingToId', 'gender', 'bloodGroup', 'city',
      'address', 'permanentAddress', 'fatherName', 'husbandName', 'qualification',
      'rfidNumber', 'aadharNumber', 'panNumber', 'bankAccount', 'ifscCode', 'photo',
    ];
    for (const field of NULLABLE_FIELDS) {
      if (raw[field] !== undefined) {
        updateData[field] = blank(raw[field]) ? null : String(raw[field]).trim();
      }
    }

    // employeeCode and dateOfJoining are NOT NULL — a blank simply means unchanged.
    if (!blank(raw.employeeCode)) updateData.employeeCode = String(raw.employeeCode).trim();
    if (!blank(raw.dateOfJoining)) updateData.dateOfJoining = toDate(raw.dateOfJoining, 'date of joining');

    if (raw.dateOfBirth !== undefined) {
      updateData.dateOfBirth = blank(raw.dateOfBirth) ? null : toDate(raw.dateOfBirth, 'date of birth');
    }

    if (raw.baseSalary !== undefined) {
      if (blank(raw.baseSalary)) {
        updateData.baseSalary = null;
      } else {
        const salary = Number(raw.baseSalary);
        if (isNaN(salary) || salary < 0) throw new Error('Invalid base salary');
        updateData.baseSalary = BigInt(Math.trunc(salary));
      }
    }

    // Name / email / phone / role belong to the linked User account.
    const userData: any = {};
    if (!blank(raw.firstName)) userData.firstName = String(raw.firstName).trim();
    if (!blank(raw.lastName)) userData.lastName = String(raw.lastName).trim();
    if (raw.phone !== undefined) userData.phone = blank(raw.phone) ? null : String(raw.phone).trim();

    const VALID_ROLES = ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT'];
    if (!blank(raw.role) && VALID_ROLES.includes(raw.role)) userData.role = raw.role;

    if (!blank(raw.email)) {
      const email = String(raw.email).trim();
      // Email is unique per school — check first so the user gets a readable
      // message instead of a raw constraint violation.
      const clash = await db.user.findFirst({
        where: { schoolId, email, NOT: { id: employee.userId } },
        select: { id: true },
      });
      if (clash) throw new Error('Email already exists');
      userData.email = email;
    }

    if (Object.keys(userData).length) {
      updateData.user = { update: userData };
    }

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        department: true,
        designation: true,
      },
    });

    return updated;
  }

  /**
   * Get employee by ID
   */
  async getEmployeeById(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            lastLogin: true,
          },
        },
        department: true,
        designation: true,
        leaves: {
          where: { status: 'PENDING' },
        },
      },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    return employee;
  }

  /**
   * List employees
   */
  async listEmployees(
    schoolId: string,
    page: number = 1,
    limit: number = 10,
    departmentId?: string,
    search?: string,
    role?: string,
    status?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { schoolId, deletedAt: null };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    // Filter by the linked user's role and/or active status.
    const userWhere: any = {};
    if (role) userWhere.role = role;
    if (status === 'active') userWhere.isActive = true;
    if (status === 'inactive') userWhere.isActive = false;
    if (Object.keys(userWhere).length) where.user = userWhere;

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
            },
          },
          department: {
            select: {
              name: true,
            },
          },
          designation: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { dateOfJoining: 'desc' },
      }),
      db.employee.count({ where }),
    ]);

    return {
      data: employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create department
   */
  async createDepartment(schoolId: string, data: CreateDepartmentRequest) {
    const { name } = data;

    const existing = await db.department.findFirst({
      where: { schoolId, name },
    });

    if (existing) {
      throw new Error('Department already exists');
    }

    const dept = await db.department.create({
      data: {
        schoolId,
        name,
        headId: data.headId,
      },
    });

    return dept;
  }

  /**
   * List departments
   */
  async listDepartments(schoolId: string) {
    const departments = await db.department.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        employees: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return departments;
  }

  /**
   * One department with its full staff roster — backs the Department Details
   * drill-down page. Soft-deleted employees are excluded so the roster matches
   * the count shown on the department list.
   */
  async getDepartment(schoolId: string, id: string) {
    const dept = await db.department.findFirst({
      where: { id, schoolId, deletedAt: null },
      include: {
        employees: {
          where: { deletedAt: null },
          select: {
            id: true,
            employeeCode: true,
            gender: true,
            photo: true,
            dateOfJoining: true,
            user: { select: { firstName: true, lastName: true, email: true, phone: true, isActive: true } },
            designation: { select: { name: true } },
          },
          orderBy: { employeeCode: 'asc' },
        },
      },
    });

    if (!dept) throw new Error('Department not found');
    return dept;
  }

  /**
   * Create designation
   */
  async createDesignation(schoolId: string, data: CreateDesignationRequest) {
    const { name } = data;

    const existing = await db.designation.findFirst({
      where: { schoolId, name },
    });

    if (existing) {
      throw new Error('Designation already exists');
    }

    const designation = await db.designation.create({
      data: {
        schoolId,
        name,
        level: data.level ?? 1,
        description: data.description,
        permissions: data.permissions || [],
      },
    });

    return designation;
  }

  /**
   * List designations
   */
  async listDesignations(schoolId: string) {
    const designations = await db.designation.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { level: 'asc' },
    });

    return designations;
  }

  /** Update a designation (name / level / privileges). */
  async updateDesignation(schoolId: string, id: string, data: any) {
    const d = await db.designation.findFirst({ where: { id, schoolId } });
    if (!d) throw new Error('Designation not found');
    return db.designation.update({
      where: { id },
      data: {
        name: data.name ?? d.name,
        level: data.level ?? d.level,
        description: data.description ?? d.description,
        permissions: Array.isArray(data.permissions) ? data.permissions : d.permissions,
      },
    });
  }

  async deleteDesignation(schoolId: string, id: string) {
    const d = await db.designation.findFirst({ where: { id, schoolId } });
    if (!d) throw new Error('Designation not found');
    await db.designation.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Designation deleted' };
  }

  async updateDepartment(schoolId: string, id: string, data: any) {
    const d = await db.department.findFirst({ where: { id, schoolId } });
    if (!d) throw new Error('Department not found');
    return db.department.update({ where: { id }, data: { name: data.name ?? d.name, headId: data.headId ?? d.headId } });
  }

  async deleteDepartment(schoolId: string, id: string) {
    const d = await db.department.findFirst({ where: { id, schoolId } });
    if (!d) throw new Error('Department not found');
    await db.department.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Department deleted' };
  }

  /**
   * Import a batch of employees (Upload Employee). Each row mirrors the
   * createEmployee payload; a default password is generated when none is given.
   */
  async importEmployees(schoolId: string, rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows to import');
    let imported = 0;
    const errors: string[] = [];

    // Resolve Department/Designation by NAME (find-or-create) and reporting-to by
    // email, caching within this import run to avoid repeat lookups.
    const deptCache = new Map<string, string>();
    const desigCache = new Map<string, string>();

    const resolveDept = async (name?: string) => {
      const n = (name || '').trim();
      if (!n) return undefined;
      const key = n.toLowerCase();
      if (deptCache.has(key)) return deptCache.get(key);
      let d = await db.department.findFirst({ where: { schoolId, name: n } });
      if (!d) d = await db.department.create({ data: { schoolId, name: n } });
      deptCache.set(key, d.id);
      return d.id;
    };
    const resolveDesig = async (name?: string) => {
      const n = (name || '').trim();
      if (!n) return undefined;
      const key = n.toLowerCase();
      if (desigCache.has(key)) return desigCache.get(key);
      let d = await db.designation.findFirst({ where: { schoolId, name: n } });
      if (!d) d = await db.designation.create({ data: { schoolId, name: n } });
      desigCache.set(key, d.id);
      return d.id;
    };
    const resolveReporting = async (email?: string) => {
      const e = (email || '').trim();
      if (!e) return undefined;
      const emp = await db.employee.findFirst({
        where: { schoolId, user: { email: { equals: e, mode: 'insensitive' } } },
      });
      return emp?.id;
    };

    for (let i = 0; i < rows.length; i++) {
      // Normalise: trim strings, blank cells → undefined.
      const raw = rows[i] || {};
      const r: any = {};
      for (const k of Object.keys(raw)) {
        const v = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
        r[k] = v === '' ? undefined : v;
      }
      try {
        const [firstName, ...rest] = String(r.name || r.firstName || `Employee ${i + 1}`).trim().split(/\s+/);
        const departmentId = await resolveDept(r.departmentName ?? r.department);
        const designationId = await resolveDesig(r.designationName ?? r.designation);
        const reportingToId = await resolveReporting(r.reportingToEmail ?? r.reportingTo);
        await this.createEmployee(schoolId, {
          firstName,
          lastName: r.lastName || rest.join(' ') || firstName,
          email: r.email || `${(r.employeeCode || r.userName || `emp${Date.now()}${i}`).toString().toLowerCase()}@staff.local`,
          password: r.password || 'Staff@123',
          phone: r.phone,
          role: r.role || 'TEACHER',
          employeeCode: r.employeeCode,
          gender: r.gender,
          city: r.city,
          address: r.address,
          permanentAddress: r.permanentAddress,
          dateOfJoining: r.dateOfJoining,
          departmentId,
          designationId,
          reportingToId,
          qualification: r.qualification,
          fatherName: r.fatherName,
          bloodGroup: r.bloodGroup,
          rfidNumber: r.rfidNumber,
        } as any);
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 1} (${r.name || r.firstName || '?'}): ${e.message}`);
      }
    }
    return { imported, failed: errors.length, errors };
  }

  /**
   * Apply leave
   */
  async applyLeave(schoolId: string, employeeId: string, data: ApplyLeaveRequest) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId, deletedAt: null },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Scope the leave type to this school — an unscoped lookup would let one
    // tenant book leave against another tenant's leave type.
    const leaveType = await db.leaveType.findFirst({
      where: { id: data.leaveTypeId, schoolId, deletedAt: null },
    });

    if (!leaveType) {
      throw new Error('Leave type not found');
    }
    if (!leaveType.enabled) {
      throw new Error(`${leaveType.name} is currently disabled`);
    }

    // `<input type="date">` posts "YYYY-MM-DD" strings, not Dates — coerce
    // before any date arithmetic or Prisma write.
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Invalid start or end date');
    }
    if (endDate < startDate) {
      throw new Error('End date cannot be before the start date');
    }

    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const actualDays = await countActualDays(schoolId, startDate, endDate);

    // Block double-booking: any live leave overlapping this range. Rejected and
    // cancelled applications free their dates back up.
    const clash = await db.leave.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    if (clash) {
      throw new Error('Leave apply failed — the selected dates are already applied for');
    }

    // Entitlement check against this employee's assigned count (falling back to
    // the leave type's default). 0 = uncapped.
    const assignment = await db.leaveAssignment.findUnique({
      where: { employeeId_leaveTypeId: { employeeId, leaveTypeId: data.leaveTypeId } },
    });
    const entitled = assignment ? assignment.count : leaveType.maxDays;

    if (entitled > 0) {
      const used = await db.leave.aggregate({
        where: { employeeId, leaveTypeId: data.leaveTypeId, deletedAt: null, status: { in: ['PENDING', 'APPROVED'] } },
        _sum: { actualDays: true },
      });
      const alreadyUsed = used._sum.actualDays || 0;
      if (alreadyUsed + actualDays > entitled) {
        throw new Error(`${leaveType.name} balance exceeded — ${Math.max(0, entitled - alreadyUsed)} day(s) remaining of ${entitled}`);
      }
    }

    const leave = await db.leave.create({
      data: {
        schoolId,
        employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate,
        endDate,
        days,
        actualDays,
        reason: data.reason,
        status: 'PENDING',
      },
      include: {
        leaveType: true,
      },
    });

    return leave;
  }

  /**
   * The Employee row for a logged-in user — backs the self-service Apply Leave
   * page, where the applicant is whoever is signed in.
   */
  async getMyEmployee(schoolId: string, userId: string) {
    const employee = await db.employee.findFirst({
      where: { userId, schoolId, deletedAt: null },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    });
    if (!employee) throw new Error('No employee record is linked to this login');
    return employee;
  }

  /** Cancel a leave (the reference UI's "Cancel" beside Approve). */
  async cancelLeave(schoolId: string, leaveId: string, remarks?: string) {
    const leave = await db.leave.findFirst({ where: { id: leaveId, schoolId, deletedAt: null } });
    if (!leave) throw new Error('Leave not found');
    if (leave.status === 'CANCELLED') throw new Error('Leave is already cancelled');

    return db.leave.update({
      where: { id: leaveId },
      data: { status: 'CANCELLED', remarks, actionDate: new Date() },
      include: { leaveType: true },
    });
  }

  // ── Leave types ──────────────────────────────────────────────────────────
  // The LeaveType table had no endpoints, so no leave could ever be applied
  // for. These back the "Leave Type" page (Add/Update + All Leave Type List).

  async listLeaveTypes(schoolId: string, includeDisabled = true) {
    return db.leaveType.findMany({
      where: { schoolId, deletedAt: null, ...(includeDisabled ? {} : { enabled: true }) },
      include: { _count: { select: { leaves: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createLeaveType(schoolId: string, data: LeaveTypeInput) {
    const name = (data.name || '').trim();
    if (!name) throw new Error('Leave type name is required');

    // A soft-deleted same-name row is restored rather than colliding with the
    // [schoolId, name] unique constraint.
    const existing = await db.leaveType.findFirst({ where: { schoolId, name } });
    if (existing && !existing.deletedAt) throw new Error('Leave type already exists');
    if (existing?.deletedAt) {
      return db.leaveType.update({
        where: { id: existing.id },
        data: { ...normalizeLeaveType(data, name), deletedAt: null },
      });
    }

    return db.leaveType.create({ data: { schoolId, ...normalizeLeaveType(data, name) } });
  }

  async updateLeaveType(schoolId: string, id: string, data: LeaveTypeInput) {
    const t = await db.leaveType.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!t) throw new Error('Leave type not found');

    return db.leaveType.update({
      where: { id },
      data: {
        name: data.name?.trim() || t.name,
        shortName: data.shortName?.trim().toUpperCase() || t.shortName,
        maxDays: data.maxDays === undefined ? t.maxDays : Math.max(0, Number(data.maxDays) || 0),
        paid: data.paid === undefined ? t.paid : !!data.paid,
        enabled: data.enabled === undefined ? t.enabled : !!data.enabled,
        validity: (data.validity as any) || t.validity,
      },
    });
  }

  async deleteLeaveType(schoolId: string, id: string) {
    const t = await db.leaveType.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!t) throw new Error('Leave type not found');

    // Soft delete — Leave.leaveTypeId is required, so a hard delete would
    // orphan every application booked against this type.
    await db.leaveType.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Leave type deleted' };
  }

  // ── Leave assign (per-employee entitlements) ─────────────────────────────

  /**
   * Every enabled leave type paired with this employee's entitlement. A type
   * with no LeaveAssignment row is reported as `configured: false` and falls
   * back to the type's own default count.
   */
  async getLeaveAssignments(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({ where: { id: employeeId, schoolId, deletedAt: null } });
    if (!employee) throw new Error('Employee not found');

    const [types, rows] = await Promise.all([
      db.leaveType.findMany({ where: { schoolId, deletedAt: null, enabled: true }, orderBy: { name: 'asc' } }),
      db.leaveAssignment.findMany({ where: { employeeId } }),
    ]);

    const byType = new Map(rows.map((r) => [r.leaveTypeId, r]));

    return types.map((t) => {
      const row = byType.get(t.id);
      return {
        leaveTypeId: t.id,
        name: t.name,
        shortName: t.shortName,
        validity: t.validity,
        paid: t.paid,
        defaultCount: t.maxDays,
        count: row ? row.count : t.maxDays,
        configured: !!row,
      };
    });
  }

  /** Bulk upsert of one employee's entitlements (the Leave Assign "Update"). */
  async saveLeaveAssignments(schoolId: string, employeeId: string, items: { leaveTypeId: string; count: number }[]) {
    const employee = await db.employee.findFirst({ where: { id: employeeId, schoolId, deletedAt: null } });
    if (!employee) throw new Error('Employee not found');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Nothing to update');

    // Only accept leave types belonging to this school.
    const valid = await db.leaveType.findMany({
      where: { schoolId, deletedAt: null, id: { in: items.map((i) => i.leaveTypeId) } },
      select: { id: true },
    });
    const allowed = new Set(valid.map((v) => v.id));

    await db.$transaction(
      items
        .filter((i) => allowed.has(i.leaveTypeId))
        .map((i) => {
          const count = Math.max(0, Number(i.count) || 0);
          return db.leaveAssignment.upsert({
            where: { employeeId_leaveTypeId: { employeeId, leaveTypeId: i.leaveTypeId } },
            create: { schoolId, employeeId, leaveTypeId: i.leaveTypeId, count },
            update: { count },
          });
        }),
    );

    return this.getLeaveAssignments(schoolId, employeeId);
  }

  /**
   * "Leave Assigned Details" — entitlement vs days already applied, per type.
   * Applied counts PENDING + APPROVED (a request in flight still reserves the
   * days) and uses the holiday-adjusted `actualDays`.
   */
  async getLeaveSummary(schoolId: string, employeeId: string) {
    const assignments = await this.getLeaveAssignments(schoolId, employeeId);

    const applied = await db.leave.groupBy({
      by: ['leaveTypeId'],
      where: { employeeId, schoolId, deletedAt: null, status: { in: ['PENDING', 'APPROVED'] } },
      _sum: { days: true, actualDays: true },
    });

    const byType = new Map(applied.map((a) => [a.leaveTypeId, a._sum]));

    return assignments.map((a) => {
      const sums = byType.get(a.leaveTypeId);
      const totalApplied = sums?.actualDays ?? sums?.days ?? 0;
      return {
        ...a,
        assigned: a.count,
        totalApplied,
        remaining: a.count > 0 ? Math.max(0, a.count - totalApplied) : null,
      };
    });
  }

  // ── School-wide leave register ───────────────────────────────────────────

  /**
   * All leave applications for the school, newest first, with optional
   * status / employee / department / date-range filters. Backs the admin
   * approval queue (the per-employee endpoint only shows one person).
   */
  async listLeaves(
    schoolId: string,
    filters: { status?: string; employeeId?: string; departmentId?: string; startDate?: string; endDate?: string } = {},
  ) {
    const where: any = { schoolId, deletedAt: null };

    if (filters.status) where.status = filters.status;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.departmentId) where.employee = { departmentId: filters.departmentId };

    // Overlap match: any leave touching the requested window, not just those
    // fully inside it.
    const from = filters.startDate ? new Date(filters.startDate) : null;
    const to = filters.endDate ? new Date(filters.endDate) : null;
    if (from && !isNaN(from.getTime())) where.endDate = { gte: from };
    if (to && !isNaN(to.getTime())) where.startDate = { lte: to };

    return db.leave.findMany({
      where,
      include: {
        leaveType: { select: { id: true, name: true, shortName: true } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { firstName: true, lastName: true, email: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Per-leave-type balance for one employee: entitlement (maxDays), days already
   * consumed by APPROVED leaves, and what's left. maxDays = 0 means unlimited.
   */
  async getLeaveBalance(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({ where: { id: employeeId, schoolId, deletedAt: null } });
    if (!employee) throw new Error('Employee not found');

    const [types, approved] = await Promise.all([
      db.leaveType.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
      db.leave.groupBy({
        by: ['leaveTypeId'],
        where: { employeeId, schoolId, status: 'APPROVED', deletedAt: null },
        _sum: { days: true },
      }),
    ]);

    const usedByType = new Map(approved.map((a) => [a.leaveTypeId, a._sum.days || 0]));

    return types.map((t) => {
      const used = usedByType.get(t.id) || 0;
      return {
        leaveTypeId: t.id,
        name: t.name,
        shortName: t.shortName,
        maxDays: t.maxDays,
        used,
        remaining: t.maxDays > 0 ? Math.max(0, t.maxDays - used) : null,
      };
    });
  }

  /**
   * Get employee leaves
   */
  async getEmployeeLeaves(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const leaves = await db.leave.findMany({
      where: { employeeId },
      include: {
        leaveType: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return leaves;
  }

  /**
   * Approve leave
   */
  async approveLeave(schoolId: string, leaveId: string, approvedBy: string) {
    const leave = await db.leave.findUnique({
      where: { id: leaveId },
    });

    if (!leave || leave.schoolId !== schoolId) {
      throw new Error('Leave not found');
    }

    const approved = await db.leave.update({
      where: { id: leaveId },
      data: {
        status: 'APPROVED',
        approvedBy,
        actionDate: new Date(),
      },
      include: {
        leaveType: true,
      },
    });

    return approved;
  }

  /**
   * Reject leave
   */
  async rejectLeave(schoolId: string, leaveId: string, remarks?: string) {
    const leave = await db.leave.findUnique({
      where: { id: leaveId },
    });

    if (!leave || leave.schoolId !== schoolId) {
      throw new Error('Leave not found');
    }

    const rejected = await db.leave.update({
      where: { id: leaveId },
      data: {
        status: 'REJECTED',
        remarks,
        actionDate: new Date(),
      },
      include: {
        leaveType: true,
      },
    });

    return rejected;
  }

  /**
   * Deactivate employee
   */
  async deactivateEmployee(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    await db.user.update({
      where: { id: employee.userId },
      data: { isActive: false },
    });

    return { message: 'Employee deactivated' };
  }

  /**
   * Reactivate employee login (re-enables the linked user account).
   */
  async activateEmployee(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    await db.user.update({
      where: { id: employee.userId },
      data: { isActive: true },
    });

    return { message: 'Employee activated' };
  }
}

export default new EmployeeService();
