import { Request, Response } from 'express';
import examsService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';

export class ExamsController {
  async createExam(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name, type, startDate, endDate } = req.body;

      if (!schoolId || !name || !type || !startDate || !endDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const exam = await examsService.createExam(schoolId, req.body);
      createdResponse(res, exam, 'Exam created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create exam');
    }
  }

  async listExams(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const result = await examsService.listExams(schoolId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list exams');
    }
  }

  async getExamById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { examId } = req.params;

      if (!schoolId || !examId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const exam = await examsService.getExamById(schoolId, examId);
      successResponse(res, 200, exam);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch exam');
    }
  }

  async addExamSubject(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { examId, subjectId, totalMarks, passingMarks } = req.body;

      if (!schoolId || !examId || !subjectId || !totalMarks || !passingMarks) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const subject = await examsService.addExamSubject(schoolId, req.body);
      createdResponse(res, subject, 'Subject added to exam successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to add subject');
    }
  }

  async enterStudentMarks(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId, examId, subjectId, marks } = req.body;

      if (!schoolId || !studentId || !examId || !subjectId || marks === undefined) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const mark = await examsService.enterStudentMarks(schoolId, req.body);
      createdResponse(res, mark, 'Marks entered successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to enter marks');
    }
  }

  async getStudentExamMarks(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId, examId } = req.params;

      if (!schoolId || !studentId || !examId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const marks = await examsService.getStudentExamMarks(schoolId, studentId, examId);
      successResponse(res, 200, marks);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch marks');
    }
  }

  async calculateExamResult(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId, examId } = req.params;

      if (!schoolId || !studentId || !examId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const result = await examsService.calculateExamResult(schoolId, studentId, examId);
      successResponse(res, 200, result);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to calculate result');
    }
  }

  async getClassRankings(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { examId, sectionId } = req.params;

      if (!schoolId || !examId || !sectionId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const rankings = await examsService.getClassRankings(schoolId, examId, sectionId);
      successResponse(res, 200, rankings);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch rankings');
    }
  }

  async getStudentPerformance(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;
      const { startDate, endDate } = req.query;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const performance = await examsService.getStudentPerformance(
        schoolId,
        studentId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      successResponse(res, 200, performance);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch performance');
    }
  }

  async deleteExam(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { examId } = req.params;

      if (!schoolId || !examId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await examsService.deleteExam(schoolId, examId);
      deletedResponse(res, 'Exam deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete exam');
    }
  }
}

export default new ExamsController();
