import { Request, Response } from 'express';
import attendanceService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse } from '@common/utils/response';

export class AttendanceController {
  async markStudentAttendance(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId, date, status } = req.body;

      if (!schoolId || !studentId || !date || !status) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const attendance = await attendanceService.markStudentAttendance(schoolId, req.body);
      createdResponse(res, attendance, 'Attendance marked successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to mark attendance');
    }
  }

  async markEmployeeAttendance(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId, date, status } = req.body;

      if (!schoolId || !employeeId || !date || !status) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const attendance = await attendanceService.markEmployeeAttendance(schoolId, req.body);
      createdResponse(res, attendance, 'Attendance marked successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to mark attendance');
    }
  }

  async getStudentAttendance(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const result = await attendanceService.getStudentAttendance(schoolId, studentId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch attendance');
    }
  }

  async getEmployeeAttendance(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const result = await attendanceService.getEmployeeAttendance(schoolId, employeeId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch attendance');
    }
  }

  async getSectionAttendanceSummary(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId } = req.params;
      const { startDate, endDate } = req.query;

      if (!schoolId || !sectionId || !startDate || !endDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const summary = await attendanceService.getSectionAttendanceSummary(
        schoolId,
        sectionId as string,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      successResponse(res, 200, summary);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch attendance summary');
    }
  }

  async getMonthlyAttendanceReport(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId, month, year } = req.query;

      if (!schoolId || !sectionId || !month || !year) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const report = await attendanceService.getMonthlyAttendanceReport(
        schoolId,
        sectionId as string,
        parseInt(month as string),
        parseInt(year as string)
      );

      successResponse(res, 200, report);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch monthly report');
    }
  }

  // ── Bulk marking ─────────────────────────────────────────────────────────
  async markEmployeesBulk(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { date, records } = req.body;
      if (!schoolId || !date || !Array.isArray(records)) {
        return void errorResponse(res, 400, 'date and records[] are required');
      }
      const result = await attendanceService.markEmployeesBulk(schoolId, date, records);
      successResponse(res, 200, result, `Saved ${result.saved} record(s)`);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to save attendance');
    }
  }

  async markStudentsBulk(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { date, records } = req.body;
      if (!schoolId || !date || !Array.isArray(records)) {
        return void errorResponse(res, 400, 'date and records[] are required');
      }
      const result = await attendanceService.markStudentsBulk(schoolId, date, records);
      successResponse(res, 200, result, `Saved ${result.saved} record(s)`);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to save attendance');
    }
  }

  // ── Rosters with status for a date ─────────────────────────────────────────
  async getEmployeesWithStatus(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const date = (req.query.date as string) || new Date().toISOString();
      if (!schoolId) return void errorResponse(res, 400, 'School context required');
      const rows = await attendanceService.getEmployeesWithStatus(schoolId, date);
      successResponse(res, 200, rows);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load employees');
    }
  }

  async getStudentsWithStatus(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const date = (req.query.date as string) || new Date().toISOString();
      const sectionId = req.query.sectionId as string | undefined;
      const classId = req.query.classId as string | undefined;
      const session = req.query.session as string | undefined;
      if (!schoolId) return void errorResponse(res, 400, 'School context required');
      const rows = await attendanceService.getStudentsWithStatus(schoolId, date, sectionId, classId, session);
      successResponse(res, 200, rows);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load students');
    }
  }

  async getEmployeeAttendanceRange(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { startDate, endDate, employeeId } = req.query;
      if (!schoolId || !startDate || !endDate) {
        return void errorResponse(res, 400, 'startDate and endDate are required');
      }
      const rows = await attendanceService.getEmployeeAttendanceRange(
        schoolId,
        startDate as string,
        endDate as string,
        (employeeId as string) || undefined
      );
      successResponse(res, 200, rows);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load attendance');
    }
  }

  async getAttendanceStatistics(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { startDate, endDate } = req.query;

      if (!schoolId || !startDate || !endDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const stats = await attendanceService.getAttendanceStatistics(
        schoolId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      successResponse(res, 200, stats);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch statistics');
    }
  }
}

export default new AttendanceController();
