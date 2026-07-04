import { Request, Response } from 'express';
import mgmtService from './mgmtService';
import { successResponse, errorResponse } from '@common/utils/response';

const codeFor = (e: any) => (String(e?.message || '').includes('not found') ? 404 : 400);

export class ExamMgmtController {
  // Grading
  async listGrades(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.listGrades(req.user!.schoolId)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async saveGrades(req: Request, res: Response): Promise<void> {
    try {
      const data = await mgmtService.saveGrades(req.user!.schoolId, req.body.items);
      successResponse(res, 200, data, `Saved ${data.saved} grade(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async deleteGrade(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.deleteGrade(req.user!.schoolId, req.params.id)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  // Schedule
  async getSchedule(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.getSchedule(req.user!.schoolId, req.params.examId, req.query.classId as string | undefined)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async saveSchedule(req: Request, res: Response): Promise<void> {
    try {
      const data = await mgmtService.saveSchedule(req.user!.schoolId, req.params.examId, req.body.classId, req.body.items);
      successResponse(res, 200, data, `Saved ${data.saved} schedule row(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async deleteScheduleItem(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.deleteScheduleItem(req.user!.schoolId, req.params.id)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async setExamStatus(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.setExamStatus(req.user!.schoolId, req.params.examId, req.body.status), 'Exam status updated'); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  // Halls
  async listHalls(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.listHalls(req.user!.schoolId)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async upsertHall(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.upsertHall(req.user!.schoolId, req.body), 'Hall saved'); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async deleteHall(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.deleteHall(req.user!.schoolId, req.params.id)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  // Seating
  async generateSeating(req: Request, res: Response): Promise<void> {
    try {
      const data = await mgmtService.generateSeating(req.user!.schoolId, req.params.examId, req.body.classIds, req.body.hallIds);
      successResponse(res, 200, data, `Allocated ${data.allocated} seat(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async getSeating(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await mgmtService.getSeating(
        req.user!.schoolId, req.params.examId,
        req.query.hallId as string | undefined, req.query.classId as string | undefined
      ));
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async hallPlan(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.hallPlan(req.user!.schoolId, req.params.examId)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async hallTickets(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.hallTickets(req.user!.schoolId, req.params.examId, req.query.classId as string)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  // Exam attendance
  async getAttendance(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await mgmtService.getAttendance(req.user!.schoolId, req.params.scheduleId)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async saveAttendance(req: Request, res: Response): Promise<void> {
    try {
      const data = await mgmtService.saveAttendance(req.user!.schoolId, req.params.scheduleId, req.body.records);
      successResponse(res, 200, data, `Saved ${data.saved} attendance record(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
}

export default new ExamMgmtController();
