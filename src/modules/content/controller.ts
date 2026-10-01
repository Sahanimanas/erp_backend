import { Request, Response } from 'express';
import contentService, { CONTENT_TYPES, type ContentTypeStr } from './service';
import { successResponse, createdResponse, errorResponse } from '@common/utils/response';

function parseType(v: unknown): ContentTypeStr | null {
  return (CONTENT_TYPES as readonly string[]).includes(v as string) ? (v as ContentTypeStr) : null;
}

export class ContentController {
  async studentList(req: Request, res: Response): Promise<void> {
    try {
      const type = parseType(req.query.type);
      if (!type) return void errorResponse(res, 400, `type must be one of ${CONTENT_TYPES.join(', ')}`);
      const data = await contentService.listForStudent(req.user!.schoolId, req.user!.id, type);
      successResponse(res, 200, data);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to load content');
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!parseType(req.body?.type)) return void errorResponse(res, 400, `type must be one of ${CONTENT_TYPES.join(', ')}`);
      if (!req.body?.title) return void errorResponse(res, 400, 'title required');
      const data = await contentService.create(req.user!.schoolId, req.user!.id, req.body);
      createdResponse(res, data, 'Content created');
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to create content');
    }
  }
}

export default new ContentController();
