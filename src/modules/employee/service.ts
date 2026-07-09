import { db } from '@common/database/client';
import { hashPassword, generateRandomPassword } from '@common/utils/crypto';
import { CreateEmployeeRequest, UpdateEmployeeRequest, CreateDepartmentRequest, CreateDesignationRequest, ApplyLeaveRequest } from './types';

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

    const updateData: any = { ...data };
    if (data.baseSalary) {
      updateData.baseSalary = BigInt(data.baseSalary);
    }

    if (data.firstName || data.lastName || data.email) {
      updateData.user = {
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
        },
      };
    }

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: updateData,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
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
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const leaveType = await db.leaveType.findUnique({
      where: { id: data.leaveTypeId },
    });

    if (!leaveType) {
      throw new Error('Leave type not found');
    }

    const days = Math.ceil((data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await db.leave.create({
      data: {
        schoolId,
        employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: data.startDate,
        endDate: data.endDate,
        days,
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
