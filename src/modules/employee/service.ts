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
  async listEmployees(schoolId: string, page: number = 1, limit: number = 10, departmentId?: string, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { schoolId };

    if (departmentId) {
      where.departmentId = departmentId;
    }

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
              firstName: true,
              lastName: true,
              email: true,
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
      where: { schoolId },
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
      where: { schoolId },
      orderBy: { level: 'asc' },
    });

    return designations;
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
}

export default new EmployeeService();
