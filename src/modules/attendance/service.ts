import { db } from '@common/database/client';
import { MarkStudentAttendanceRequest, MarkEmployeeAttendanceRequest, AttendanceReportRequest } from './types';

// Normalise any date-ish input to local midnight (attendance is day-granular).
const dayStart = (value: any): Date => {
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new Error('A valid date is required');
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const dayEnd = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

type AttStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'LATE' | 'HALF_DAY';
const normStatus = (s: any): AttStatus => {
  const v = String(s || 'PRESENT').toUpperCase().replace(/[\s-]/g, '_');
  const allowed: AttStatus[] = ['PRESENT', 'ABSENT', 'LEAVE', 'LATE', 'HALF_DAY'];
  return (allowed.includes(v as AttStatus) ? v : 'PRESENT') as AttStatus;
};

export class AttendanceService {
  /**
   * Mark student attendance
   */
  async markStudentAttendance(schoolId: string, data: MarkStudentAttendanceRequest) {
    const { studentId, status, remarks } = data;
    const date = new Date(data.date as any); // accept date-only strings from the UI
    if (isNaN(date.getTime())) {
      throw new Error('A valid date is required');
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Check if attendance already marked
    const existing = await db.studentAttendance.findFirst({
      where: {
        schoolId,
        studentId,
        date: {
          gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
        },
      },
    });

    if (existing) {
      // Update existing
      const updated = await db.studentAttendance.update({
        where: { id: existing.id },
        data: { status, remarks },
      });

      return updated;
    }

    // Create new
    const attendance = await db.studentAttendance.create({
      data: {
        schoolId,
        studentId,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        status,
        remarks,
      },
    });

    return attendance;
  }

  /**
   * Mark employee attendance
   */
  async markEmployeeAttendance(schoolId: string, data: MarkEmployeeAttendanceRequest & { inTime?: string; outTime?: string }) {
    const { employeeId, remarks, inTime, outTime } = data;
    const status = normStatus(data.status);
    const date = dayStart(data.date);

    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const existing = await db.employeeAttendance.findFirst({
      where: { schoolId, employeeId, date: { gte: date, lt: dayEnd(date) } },
    });

    if (existing) {
      return db.employeeAttendance.update({
        where: { id: existing.id },
        data: { status, remarks, inTime, outTime },
      });
    }

    return db.employeeAttendance.create({
      data: { schoolId, employeeId, date, status, remarks, inTime, outTime },
    });
  }

  /**
   * Bulk-mark employee attendance for a single date (the Employee Attendance
   * grid "Update Attendance" action). Upserts one row per employee.
   */
  async markEmployeesBulk(
    schoolId: string,
    date: any,
    records: { employeeId: string; status: any; inTime?: string; outTime?: string; remarks?: string }[]
  ) {
    const day = dayStart(date);
    let saved = 0;
    const errors: string[] = [];

    for (const r of records) {
      try {
        const existing = await db.employeeAttendance.findFirst({
          where: { schoolId, employeeId: r.employeeId, date: { gte: day, lt: dayEnd(day) } },
        });
        const data = {
          status: normStatus(r.status),
          inTime: r.inTime || null,
          outTime: r.outTime || null,
          remarks: r.remarks || null,
        };
        if (existing) {
          await db.employeeAttendance.update({ where: { id: existing.id }, data });
        } else {
          await db.employeeAttendance.create({
            data: { schoolId, employeeId: r.employeeId, date: day, ...data },
          });
        }
        saved++;
      } catch (e: any) {
        errors.push(`${r.employeeId}: ${e.message}`);
      }
    }
    return { saved, failed: errors.length, errors };
  }

  /**
   * Bulk-mark student attendance for a single date (Student Attendance grid).
   */
  async markStudentsBulk(
    schoolId: string,
    date: any,
    records: { studentId: string; status: any; remarks?: string }[]
  ) {
    const day = dayStart(date);
    let saved = 0;
    const errors: string[] = [];

    for (const r of records) {
      try {
        const existing = await db.studentAttendance.findFirst({
          where: { schoolId, studentId: r.studentId, date: { gte: day, lt: dayEnd(day) } },
        });
        const data = { status: normStatus(r.status), remarks: r.remarks || null };
        if (existing) {
          await db.studentAttendance.update({ where: { id: existing.id }, data });
        } else {
          await db.studentAttendance.create({
            data: { schoolId, studentId: r.studentId, date: day, ...data },
          });
        }
        saved++;
      } catch (e: any) {
        errors.push(`${r.studentId}: ${e.message}`);
      }
    }
    return { saved, failed: errors.length, errors };
  }

  /**
   * Roster of every employee with their attendance status for a given date.
   * Powers the Employee Attendance marking grid and "All Employee" daily view.
   */
  async getEmployeesWithStatus(schoolId: string, date: any) {
    const day = dayStart(date);
    const employees = await db.employee.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        user: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
      orderBy: { employeeCode: 'asc' },
    });
    const records = await db.employeeAttendance.findMany({
      where: { schoolId, date: { gte: day, lt: dayEnd(day) } },
    });
    const byEmp = new Map(records.map((r) => [r.employeeId, r]));

    return employees.map((e) => {
      const att = byEmp.get(e.id);
      return {
        employeeId: e.id,
        employeeCode: e.employeeCode,
        name: e.user ? `${e.user.firstName} ${e.user.lastName}` : e.employeeCode,
        designation: e.designation?.name ?? null,
        department: e.department?.name ?? null,
        status: att?.status ?? null,
        inTime: att?.inTime ?? null,
        outTime: att?.outTime ?? null,
      };
    });
  }

  /**
   * Employee attendance records across a date range (View Employee / View All
   * Employee Attendance). Optionally scoped to one employee.
   */
  async getEmployeeAttendanceRange(schoolId: string, startDate: any, endDate: any, employeeId?: string) {
    const gte = dayStart(startDate);
    const lte = dayEnd(dayStart(endDate));
    const where: any = { schoolId, date: { gte, lt: lte } };
    if (employeeId) where.employeeId = employeeId;

    const records = await db.employeeAttendance.findMany({
      where,
      orderBy: [{ date: 'desc' }],
    });

    // Decorate with employee name/designation.
    const empIds = Array.from(new Set(records.map((r) => r.employeeId)));
    const emps = await db.employee.findMany({
      where: { id: { in: empIds } },
      include: { user: { select: { firstName: true, lastName: true } }, designation: { select: { name: true } } },
    });
    const byId = new Map(emps.map((e) => [e.id, e]));

    return records.map((r) => {
      const e = byId.get(r.employeeId);
      return {
        id: r.id,
        employeeId: r.employeeId,
        name: e?.user ? `${e.user.firstName} ${e.user.lastName}` : r.employeeId,
        designation: e?.designation?.name ?? null,
        date: r.date,
        status: r.status,
        inTime: r.inTime,
        outTime: r.outTime,
        remarks: r.remarks,
      };
    });
  }

  /**
   * Roster of students (optionally one section) with their status for a date.
   * Powers the Student Attendance marking grid and All-Student daily view.
   */
  async getStudentsWithStatus(schoolId: string, date: any, sectionId?: string) {
    const day = dayStart(date);
    const where: any = { schoolId, deletedAt: null };
    if (sectionId) where.sectionId = sectionId;

    const students = await db.student.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        section: { select: { name: true, class: { select: { name: true } } } },
      },
      orderBy: { rollNumber: 'asc' },
    });
    const records = await db.studentAttendance.findMany({
      where: { schoolId, date: { gte: day, lt: dayEnd(day) }, ...(sectionId ? { student: { sectionId } } : {}) },
    });
    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    return students.map((s) => {
      const att = byStudent.get(s.id);
      return {
        studentId: s.id,
        rollNumber: s.rollNumber,
        name: s.user ? `${s.user.firstName} ${s.user.lastName}` : s.rollNumber,
        className: s.section?.class?.name ?? null,
        sectionName: s.section?.name ?? null,
        status: att?.status ?? null,
        remarks: att?.remarks ?? null,
      };
    });
  }

  /**
   * Get student attendance
   */
  async getStudentAttendance(schoolId: string, studentId: string, page: number = 1, limit: number = 30) {
    const skip = (page - 1) * limit;

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const [attendance, total] = await Promise.all([
      db.studentAttendance.findMany({
        where: { schoolId, studentId },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      db.studentAttendance.count({ where: { schoolId, studentId } }),
    ]);

    return {
      data: attendance,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get employee attendance
   */
  async getEmployeeAttendance(schoolId: string, employeeId: string, page: number = 1, limit: number = 30) {
    const skip = (page - 1) * limit;

    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const [attendance, total] = await Promise.all([
      db.employeeAttendance.findMany({
        where: { schoolId, employeeId },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      db.employeeAttendance.count({ where: { schoolId, employeeId } }),
    ]);

    return {
      data: attendance,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get section attendance summary
   */
  async getSectionAttendanceSummary(schoolId: string, sectionId: string, startDate: Date, endDate: Date) {
    const students = await db.student.findMany({
      where: { sectionId },
      select: { id: true, rollNumber: true, user: { select: { firstName: true, lastName: true } } },
    });

    if (students.length === 0) {
      return [];
    }

    const attendance = await db.studentAttendance.findMany({
      where: {
        schoolId,
        studentId: { in: students.map(s => s.id) },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const summary = students.map(student => {
      const studentAttendance = attendance.filter(a => a.studentId === student.id);
      const present = studentAttendance.filter(a => a.status === 'PRESENT').length;
      const absent = studentAttendance.filter(a => a.status === 'ABSENT').length;
      const total = studentAttendance.length;
      const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

      return {
        studentId: student.id,
        rollNumber: student.rollNumber,
        name: `${student.user.firstName} ${student.user.lastName}`,
        present,
        absent,
        total,
        percentage,
      };
    });

    return summary;
  }

  /**
   * Get monthly attendance report
   */
  async getMonthlyAttendanceReport(schoolId: string, sectionId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    return this.getSectionAttendanceSummary(schoolId, sectionId, startDate, endDate);
  }

  /**
   * Get attendance statistics
   */
  async getAttendanceStatistics(schoolId: string, startDate: Date, endDate: Date) {
    const studentAttendance = await db.studentAttendance.groupBy({
      by: ['status'],
      where: {
        schoolId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
    });

    const employeeAttendance = await db.employeeAttendance.groupBy({
      by: ['status'],
      where: {
        schoolId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
    });

    return {
      student: Object.fromEntries(studentAttendance.map(a => [a.status, a._count])),
      employee: Object.fromEntries(employeeAttendance.map(a => [a.status, a._count])),
    };
  }
}

export default new AttendanceService();
