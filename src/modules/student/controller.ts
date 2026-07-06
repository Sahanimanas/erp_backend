import { Request, Response } from 'express';
import studentService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';

export class StudentController {
  async createStudent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { firstName, lastName, password, sectionId, classId, sectionName, rollNumber } = req.body;

      // Email is intentionally NOT required — the service stores it as NULL when
      // blank (matching the "auto from roll no if blank" UI hint and the bulk
      // import path). Report the actual missing field so the toast isn't
      // misleading (it used to always blame "class & section").
      const hasSection = sectionId || (classId && sectionName);
      const missing =
        !schoolId ? 'school context' :
        !firstName ? 'first name' :
        !lastName ? 'last name' :
        !password ? 'password' :
        !hasSection ? 'class & section' :
        !rollNumber ? 'roll number' : null;
      if (missing) {
        return void errorResponse(res, 400, `Required field missing: ${missing}`);
      }

      const student = await studentService.createStudent(schoolId!, req.body);
      createdResponse(res, student, 'Student created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create student');
    }
  }

  async updateStudent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const student = await studentService.updateStudent(schoolId, studentId, req.body);
      successResponse(res, 200, student, 'Student updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update student');
    }
  }

  async getStudentById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const student = await studentService.getStudentById(schoolId, studentId);
      successResponse(res, 200, student);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch student');
    }
  }

  async listStudents(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sectionId = req.query.sectionId as string | undefined;
      const search = req.query.search as string | undefined;
      const classId = req.query.classId as string | undefined;
      const admissionFrom = req.query.admissionFrom as string | undefined;
      const admissionTo = req.query.admissionTo as string | undefined;
      const fatherName = req.query.fatherName as string | undefined;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const result = await studentService.listStudents(schoolId, page, limit, sectionId, search, classId, admissionFrom, admissionTo, fatherName);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list students');
    }
  }

  async promoteStudents(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const result = await studentService.promoteStudents(schoolId, req.body);
      successResponse(res, 200, result, `Promoted ${result.promoted} student(s)`);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to promote students');
    }
  }

  async bulkUpdateStudents(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const result = await studentService.bulkUpdateStudents(schoolId, req.body.updates || req.body);
      successResponse(res, 200, result, `Updated ${result.updated} student(s)`);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to update students');
    }
  }

  async importStudents(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const result = await studentService.importStudents(schoolId, req.body.students || req.body.rows || req.body);
      successResponse(res, 200, result, `Imported ${result.imported} student(s)`);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to import students');
    }
  }

  async deactivateStudent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await studentService.deactivateStudent(schoolId, studentId);
      successResponse(res, 200, null, 'Student deactivated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to deactivate student');
    }
  }

  async activateStudent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await studentService.activateStudent(schoolId, studentId);
      successResponse(res, 200, null, 'Student activated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to activate student');
    }
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;
      const { type, fileUrl } = req.body;

      if (!schoolId || !studentId || !type || !fileUrl) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const document = await studentService.uploadDocument(schoolId, studentId, { type, fileUrl });
      createdResponse(res, document, 'Document uploaded successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to upload document');
    }
  }

  async getStudentDocuments(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const documents = await studentService.getStudentDocuments(schoolId, studentId);
      successResponse(res, 200, documents);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch documents');
    }
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { documentId } = req.params;

      if (!schoolId || !documentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await studentService.deleteDocument(schoolId, documentId);
      deletedResponse(res, 'Document deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete document');
    }
  }

  async getStudentDues(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const dues = await studentService.getStudentDues(schoolId, studentId);
      successResponse(res, 200, dues);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch dues');
    }
  }

  async getAttendancePercentage(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const attendance = await studentService.getAttendancePercentage(schoolId, studentId);
      successResponse(res, 200, attendance);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch attendance');
    }
  }

  async deleteStudent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await studentService.deleteStudent(schoolId, studentId);
      deletedResponse(res, 'Student deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete student');
    }
  }
}

export default new StudentController();
