import { Request, Response } from 'express';
import parentService from './service';
import {
  successResponse,
  errorResponse,
  createdResponse,
  paginatedResponse,
  deletedResponse,
} from '@common/utils/response';

export class ParentController {
  async getMyChildren(req: Request, res: Response): Promise<void> {
    try {
      const children = await parentService.getMyChildren(req.user!.schoolId, req.user!.id);
      successResponse(res, 200, children);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load children');
    }
  }

  async createParent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { firstName, lastName, email, password, relationship } = req.body;

      if (!schoolId || !firstName || !lastName || !email || !password || !relationship) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const parent = await parentService.createParent(schoolId, req.body);
      createdResponse(res, parent, 'Parent created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create parent');
    }
  }

  async listParents(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await parentService.listParents(schoolId, page, limit, search);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list parents');
    }
  }

  async getParentById(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { parentId } = req.params;
      if (!schoolId || !parentId) return void errorResponse(res, 400, 'Required fields missing');

      const parent = await parentService.getParentById(schoolId, parentId);
      successResponse(res, 200, parent);
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, code, error.message || 'Failed to fetch parent');
    }
  }

  async updateParent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { parentId } = req.params;
      if (!schoolId || !parentId) return void errorResponse(res, 400, 'Required fields missing');

      const parent = await parentService.updateParent(schoolId, parentId, req.body);
      successResponse(res, 200, parent, 'Parent updated successfully');
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, code, error.message || 'Failed to update parent');
    }
  }

  async deactivateParent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { parentId } = req.params;
      if (!schoolId || !parentId) return void errorResponse(res, 400, 'Required fields missing');

      const result = await parentService.setActive(schoolId, parentId, false);
      successResponse(res, 200, null, result.message);
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, code, error.message || 'Failed to deactivate parent');
    }
  }

  async activateParent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { parentId } = req.params;
      if (!schoolId || !parentId) return void errorResponse(res, 400, 'Required fields missing');

      const result = await parentService.setActive(schoolId, parentId, true);
      successResponse(res, 200, null, result.message);
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, code, error.message || 'Failed to activate parent');
    }
  }

  async deleteParent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { parentId } = req.params;
      if (!schoolId || !parentId) return void errorResponse(res, 400, 'Required fields missing');

      await parentService.deleteParent(schoolId, parentId);
      deletedResponse(res, 'Parent deleted successfully');
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, code, error.message || 'Failed to delete parent');
    }
  }
}

export default new ParentController();
