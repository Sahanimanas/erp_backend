import { Request, Response } from 'express';
import timetableService from './service';
import { successResponse, errorResponse, createdResponse, deletedResponse } from '@common/utils/response';

export class TimetableController {
  async createPeriod(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name, startTime, endTime } = req.body;

      if (!schoolId || !name || !startTime || !endTime) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const period = await timetableService.createPeriod(schoolId, req.body);
      createdResponse(res, period, 'Period created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create period');
    }
  }

  async listPeriods(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const periods = await timetableService.listPeriods(schoolId);
      successResponse(res, 200, periods);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list periods');
    }
  }

  async updatePeriod(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { periodId } = req.params;

      if (!schoolId || !periodId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const period = await timetableService.updatePeriod(schoolId, periodId, req.body);
      successResponse(res, 200, period, 'Period updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update period');
    }
  }

  async createTimetableSlot(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId, periodId, subjectId, day } = req.body;

      if (!schoolId || !sectionId || !periodId || !subjectId || !day) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const slot = await timetableService.createTimetableSlot(schoolId, req.body);
      createdResponse(res, slot, 'Timetable slot created successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 409;
      errorResponse(res, statusCode, error.message || 'Failed to create slot');
    }
  }

  async getSectionTimetable(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId } = req.params;

      if (!schoolId || !sectionId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const timetable = await timetableService.getSectionTimetable(schoolId, sectionId);
      successResponse(res, 200, timetable);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch timetable');
    }
  }

  async getTeacherSchedule(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { employeeId } = req.params;

      if (!schoolId || !employeeId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const schedule = await timetableService.getTeacherSchedule(schoolId, employeeId);
      successResponse(res, 200, schedule);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch schedule');
    }
  }

  async updateTimetableSlot(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { slotId } = req.params;

      if (!schoolId || !slotId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const slot = await timetableService.updateTimetableSlot(schoolId, slotId, req.body);
      successResponse(res, 200, slot, 'Timetable slot updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update slot');
    }
  }

  async deleteTimetableSlot(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { slotId } = req.params;

      if (!schoolId || !slotId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await timetableService.deleteTimetableSlot(schoolId, slotId);
      deletedResponse(res, 'Timetable slot deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete slot');
    }
  }

  async getClassSchedule(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId } = req.params;

      if (!schoolId || !classId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const schedule = await timetableService.getClassSchedule(schoolId, classId);
      successResponse(res, 200, schedule);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch schedule');
    }
  }
}

export default new TimetableController();
