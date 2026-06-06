import { db } from '@common/database/client';
import { MarkStudentAttendanceRequest, MarkEmployeeAttendanceRequest, AttendanceReportRequest } from './types';

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
  async markEmployeeAttendance(schoolId: string, data: MarkEmployeeAttendanceRequest) {
    const { employeeId, status, remarks } = data;
    const date = new Date(data.date as any); // accept date-only strings from the UI
    if (isNaN(date.getTime())) {
      throw new Error('A valid date is required');
    }

    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const existing = await db.employeeAttendance.findFirst({
      where: {
        schoolId,
        employeeId,
        date: {
          gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
        },
      },
    });

    if (existing) {
      const updated = await db.employeeAttendance.update({
        where: { id: existing.id },
        data: { status, remarks },
      });

      return updated;
    }

    const attendance = await db.employeeAttendance.create({
      data: {
        schoolId,
        employeeId,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        status,
        remarks,
      },
    });

    return attendance;
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
