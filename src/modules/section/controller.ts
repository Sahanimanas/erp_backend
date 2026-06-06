import { Request, Response } from 'express';
import sectionService from './service';
import { successResponse, errorResponse, paginatedResponse } from '@common/utils/response';

export class SectionController {
  async listSections(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const classId = req.query.classId as string | undefined;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const sections = await sectionService.listSections(schoolId, classId);
      successResponse(res, 200, sections);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list sections');
    }
  }
}

export default new SectionController();
