import { Request, Response } from 'express';
import academicService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';

export class AcademicController {
  /**
   * Create academic year
   */
  async createAcademicYear(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name, startDate, endDate } = req.body;

      if (!schoolId || !name || !startDate || !endDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const year = await academicService.createAcademicYear(schoolId, req.body);
      createdResponse(res, year, 'Academic year created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create academic year');
    }
  }

  /**
   * Update academic year
   */
  async updateAcademicYear(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { yearId } = req.params;

      if (!schoolId || !yearId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const year = await academicService.updateAcademicYear(schoolId, yearId, req.body);
      successResponse(res, 200, year, 'Academic year updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update academic year');
    }
  }

  /**
   * List academic years
   */
  async listAcademicYears(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const years = await academicService.listAcademicYears(schoolId);
      successResponse(res, 200, years);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list academic years');
    }
  }

  /**
   * Get academic year by ID
   */
  async getAcademicYearById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { yearId } = req.params;

      if (!schoolId || !yearId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const year = await academicService.getAcademicYearById(schoolId, yearId);
      successResponse(res, 200, year);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch academic year');
    }
  }

  /**
   * Create class
   */
  async createClass(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name, academicYearId } = req.body;

      if (!schoolId || !name || !academicYearId) {
        return void errorResponse(res, 400, 'School ID, class name, and academic year ID are required');
      }

      const cls = await academicService.createClass(schoolId, req.body);
      createdResponse(res, cls, 'Class created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create class');
    }
  }

  /**
   * Update class
   */
  async updateClass(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId } = req.params;

      if (!schoolId || !classId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const cls = await academicService.updateClass(schoolId, classId, req.body);
      successResponse(res, 200, cls, 'Class updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update class');
    }
  }

  /**
   * List classes
   */
  async listClasses(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const result = await academicService.listClasses(schoolId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list classes');
    }
  }

  /**
   * Get class by ID
   */
  async getClassById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId } = req.params;

      if (!schoolId || !classId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const cls = await academicService.getClassById(schoolId, classId);
      successResponse(res, 200, cls);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch class');
    }
  }

  /**
   * Delete class
   */
  async deleteClass(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId } = req.params;

      if (!schoolId || !classId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await academicService.deleteClass(schoolId, classId);
      deletedResponse(res, 'Class deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete class');
    }
  }

  /**
   * Create section
   */
  async createSection(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId, name } = req.body;

      if (!schoolId || !classId || !name) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const section = await academicService.createSection(schoolId, req.body);
      createdResponse(res, section, 'Section created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create section');
    }
  }

  /**
   * Update section
   */
  async updateSection(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId } = req.params;

      if (!schoolId || !sectionId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const section = await academicService.updateSection(schoolId, sectionId, req.body);
      successResponse(res, 200, section, 'Section updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update section');
    }
  }

  /**
   * List sections
   */
  async listSections(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const classId = req.query.classId as string | undefined;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const sections = await academicService.listSections(schoolId, classId);
      successResponse(res, 200, sections);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list sections');
    }
  }

  /**
   * Get section by ID
   */
  async getSectionById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId } = req.params;

      if (!schoolId || !sectionId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const section = await academicService.getSectionById(schoolId, sectionId);
      successResponse(res, 200, section);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch section');
    }
  }

  /**
   * Delete section
   */
  async deleteSection(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId } = req.params;

      if (!schoolId || !sectionId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await academicService.deleteSection(schoolId, sectionId);
      deletedResponse(res, 'Section deleted successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to delete section');
    }
  }

  /**
   * Create subject
   */
  async createSubject(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name, code } = req.body;

      if (!schoolId || !name || !code) {
        return void errorResponse(res, 400, 'Name and code are required');
      }

      const subject = await academicService.createSubject(schoolId, req.body);
      createdResponse(res, subject, 'Subject created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create subject');
    }
  }

  /**
   * Update subject
   */
  async updateSubject(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { subjectId } = req.params;

      if (!schoolId || !subjectId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const subject = await academicService.updateSubject(schoolId, subjectId, req.body);
      successResponse(res, 200, subject, 'Subject updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update subject');
    }
  }

  /**
   * List subjects
   */
  async listSubjects(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const result = await academicService.listSubjects(schoolId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list subjects');
    }
  }

  /**
   * Get subject by ID
   */
  async getSubjectById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { subjectId } = req.params;

      if (!schoolId || !subjectId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const subject = await academicService.getSubjectById(schoolId, subjectId);
      successResponse(res, 200, subject);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch subject');
    }
  }

  /**
   * Delete subject
   */
  async deleteSubject(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { subjectId } = req.params;

      if (!schoolId || !subjectId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await academicService.deleteSubject(schoolId, subjectId);
      deletedResponse(res, 'Subject deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete subject');
    }
  }

  /**
   * Assign teacher to subject
   */
  async assignTeacherToSubject(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId, subjectId, teacherId } = req.body;

      if (!schoolId || !classId || !subjectId || !teacherId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const assignment = await academicService.assignTeacherToSubject(schoolId, req.body);
      createdResponse(res, assignment, 'Teacher assigned successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to assign teacher');
    }
  }

  /**
   * Get class timetable
   */
  async getClassTimetable(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId } = req.params;

      if (!schoolId || !classId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const timetable = await academicService.getClassTimetable(schoolId, classId);
      successResponse(res, 200, timetable);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch timetable');
    }
  }

  /**
   * List class subjects
   */
  async listClassSubjects(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { classId } = req.params;

      if (!schoolId || !classId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const subjects = await academicService.listClassSubjects(schoolId, classId);
      successResponse(res, 200, subjects);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch class subjects');
    }
  }
}

export default new AcademicController();
