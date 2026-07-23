import { Request, Response } from 'express';
import timetableService from './service';
import { successResponse, errorResponse } from '@common/utils/response';

export class TimetableController {
  /** GET /timetable?sectionId=&session=&academicYearId= */
  async getSectionTimetable(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId, session, academicYearId } = req.query as Record<string, string>;
      if (!schoolId || !sectionId) return void errorResponse(res, 400, 'sectionId required');

      const data = await timetableService.getSectionTimetable(
        schoolId,
        sectionId,
        session || 'DEFAULT',
        academicYearId || null,
      );
      successResponse(res, 200, data);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load timetable');
    }
  }

  /** POST /timetable */
  async saveSectionTimetable(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const data = await timetableService.saveSectionTimetable(schoolId, req.body);
      successResponse(res, 200, data, 'Timetable saved');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to save timetable');
    }
  }

  /** GET /timetable/employee?employeeId=&session=&academicYearId= */
  async getEmployeeTimetable(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId, session, academicYearId } = req.query as Record<string, string>;
      if (!schoolId || !employeeId) return void errorResponse(res, 400, 'employeeId required');

      const data = await timetableService.getEmployeeTimetable(
        schoolId,
        employeeId,
        session || 'DEFAULT',
        academicYearId || null,
      );
      successResponse(res, 200, data);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load employee timetable');
    }
  }

  /** GET /timetable/session-day?day=&session=&academicYearId= */
  async getSessionDayTimetable(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { day, session, academicYearId } = req.query as Record<string, string>;
      if (!schoolId || !day) return void errorResponse(res, 400, 'day required');

      const data = await timetableService.getSessionDayTimetable(
        schoolId,
        day,
        session || 'DEFAULT',
        academicYearId || null,
      );
      successResponse(res, 200, data);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load session timetable');
    }
  }
}

export default new TimetableController();
